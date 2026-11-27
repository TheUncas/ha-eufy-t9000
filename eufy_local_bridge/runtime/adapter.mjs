import { EventEmitter, once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const bad = (status, message, reason) => Object.assign(new Error(message), { status, statusCode: status, reason });
const identity = new Set(['name', 'model', 'hardwareVersion', 'softwareVersion', 'type']);
const rtcFailures = new Set(['sign_unauthorized', 'sign_refused', 'rtc_auth', 'peer_unavailable', 'region_unavailable',
  'signaling_unavailable', 'hub_unreachable', 'offer_unavailable', 'answer_unavailable', 'ice_unavailable',
  'ice_path_lost', 'no_lan_candidate', 'secure_channel_unavailable', 'command_channel_unavailable']);
const iceStates = new Set(['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed', 'unknown']);
const iceFlags = ['iceConnected', 'pairSeen', 'localUdpAnnounced', 'remoteUdpSubmitted'];
const optionalIceFlags = ['iceCheckingSeen', 'iceFailedSeen', 'localUdpMatchesRoute', 'remoteUdpMatchesStation'];
const activeModes = new Set([0, 1, 3, 4, 5, 6, 63]);
const alarmFailures = new Set([...rtcFailures, 'connector_unavailable', 'homebase_unavailable', 'homebase_unreachable',
  'command_unconfirmed']);
export function publicAlarmFailureReason(reason) {
  return alarmFailures.has(reason) ? reason : undefined;
}

function publicIceAttempt(attempt) {
  if (!iceStates.has(attempt?.iceState) || typeof attempt.finishedAt !== 'string' || attempt.finishedAt.length !== 24 ||
      new Date(attempt.finishedAt).toJSON() !== attempt.finishedAt || !iceFlags.every(key => typeof attempt[key] === 'boolean')) return;
  const report = { finishedAt: attempt.finishedAt, iceState: attempt.iceState };
  for (const key of [...iceFlags, ...optionalIceFlags]) {
    if (typeof attempt[key] === 'boolean') report[key] = attempt[key];
  }
  return report;
}

// Inventory values can predate this connection. Keep them separate from confirmed live state.
function rememberReading(entry, name, value, metadata) {
  if (name === 'battery' && entry.kind === 'camera' && metadata?.readable !== false &&
      Number.isInteger(value) && value >= 0 && value <= 100) entry.reported.battery = value;
  if (name === 'guardMode' && 'online' in entry && Number.isInteger(value) &&
      Object.hasOwn(metadata?.states ?? {}, value)) entry.reported.guardMode = value;
}
function safeName(name, type) {
  if (typeof name !== 'string' || !/^[a-z][a-zA-Z0-9]*$/.test(name)) return false;
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').toLowerCase();
  if (/\b(url|uri|picture|account|email|address|location|serial number|user ?name|user id|password|passwd|passphrase|pwd|psk|secret|credentials?|tokens?|gtoken|session id|auth|authorization|bearer|jwt|constructor|prototype)\b/.test(words)) return false;
  // A boolean such as "switchModeWithAccessCode" configures a feature. An access code value is private.
  return type === 'boolean' || !/\b(keys?|passcode|pin|code|otp)\b/.test(words);
}
const safeValue = value => typeof value === 'number' ? Number.isFinite(value)
  : typeof value === 'boolean' || (typeof value === 'string' && value.length <= 4096 &&
    !/:\/\/|^\s*(?:\/\/|data:)|^\s*(?:bearer|basic)\s+[\w.+/=_-]{8,}\s*$|-----BEGIN [\w ]*PRIVATE KEY-----/i.test(value));

const safeLabel = label => typeof label === 'string' && label.length <= 256 && safeValue(label);

// Metadata does not describe the children of an object. Reject the entire value
// when a field is private: sending a redacted replacement would overwrite it.
function safeObject(root) {
  if (!root || typeof root !== 'object') return false;
  let size = 0;
  let nodes = 0;
  function visit(value, depth) {
    if (++nodes > 768 || depth > 12) return false;
    if (typeof value === 'string') size += value.length;
    if (size > 8192) return false;
    if (value === null) return true;
    if (typeof value !== 'object') return safeValue(value);
    if (Array.isArray(value)) return value.length <= 512 && value.every(child => visit(child, depth + 1));
    if (value.type === 'Buffer' || Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Object.entries(value).every(([key, child]) => {
      size += key.length;
      const name = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
      const allowed = /^\d{1,8}$/.test(key) || (safeName(name, typeof child) && !/base64|thumbnail|imageData/i.test(name));
      return allowed && visit(child, depth + 1);
    });
  }
  return visit(root, 0);
}

function readSettings(metadata) {
  const settings = Object.create(null);
  for (const [name, meta] of Object.entries(metadata)) {
    if (meta?.writeable !== true || !safeName(name, meta.type) || !['boolean', 'number', 'string'].includes(meta.type)) continue;
    const setting = { type: meta.type };
    for (const key of ['min', 'max', 'steps', 'minLength', 'maxLength']) {
      if (Number.isFinite(meta[key])) setting[key] = meta[key];
    }
    if (safeLabel(meta.label)) setting.label = meta.label;
    if (meta.states) {
      if (Object.getPrototypeOf(meta.states) !== Object.prototype) continue;
      const choices = Object.entries(meta.states);
      if (!choices.every(([value, label]) => safeLabel(value) && safeLabel(label))) continue;
      setting.states = Object.fromEntries(choices);
    }
    settings[name] = setting;
  }
  return settings;
}

function validateValue(meta, value) {
  if (meta.type === 'object') return safeObject(value);
  if (typeof value !== meta.type || !safeValue(value)) return false;
  if (meta.states && !Object.hasOwn(meta.states, value)) return false;
  if (meta.type === 'number') {
    if (value < meta.min || value > meta.max) return false;
    if (meta.steps > 0) {
      const step = (value - (meta.min ?? 0)) / meta.steps;
      if (Math.abs(step - Math.round(step)) > 1e-8) return false;
    }
  }
  if (typeof value === 'string' && (value.length < meta.minLength || value.length > meta.maxLength)) return false;
  return true;
}

const deviceReports = {
  'sensor open': 'sensorOpen', 'motion detected': 'motionDetected', 'person detected': 'personDetected',
  'sound detected': 'soundDetected', 'pet detected': 'petDetected', 'vehicle detected': 'vehicleDetected',
  'rings': 'ringing', 'low battery': 'batteryLow', 'locked': 'locked',
};

const driverProtocol = 'eufy-bridge-v1';

function diagnosticTarget(id, ip) {
  const address = isIPv4(ip) && /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(ip) ? ip : null;
  return Object.freeze({ id, address });
}

async function privateProtocols(path) {
  try {
    const token = (await readFile(path, 'utf8')).trim();
    if (/^[a-f0-9]{64}$/.test(token)) return [driverProtocol, 'key-' + token];
  } catch {
    // The supervisor creates the file when it starts.
  }
  throw bad(503, 'Authentification du connecteur indisponible.');
}

// The pinned server only returns the outcome of a login challenge through schema 9.
// Use a second socket so events and video keep their normal schema throughout login.
async function answerChallenge(url, credentialPath, command, fields, stillPending) {
  const protocols = credentialPath ? await privateProtocols(credentialPath) : undefined;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, protocols);
    const finish = error => {
      clearTimeout(timer);
      socket.onclose = socket.onerror = socket.onmessage = null;
      socket.close();
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(bad(504, 'Délai de vérification eufy dépassé.')), 30_000);
    socket.onerror = socket.onclose = () => finish(bad(503, 'Connexion eufy interrompue.'));
    socket.onmessage = ({ data }) => {
      try {
        if (credentialPath && socket.protocol !== driverProtocol) return finish(bad(503, 'Connexion privée au connecteur refusée.'));
        const msg = JSON.parse(data);
        if (msg.type === 'version') {
          socket.send(JSON.stringify({ command: 'set_api_schema', messageId: 'schema', schemaVersion: 9 }));
        } else if (msg.type === 'result' && msg.messageId === 'schema') {
          if (!msg.success || !stillPending()) return finish(bad(409, 'La vérification eufy a changé.'));
          socket.send(JSON.stringify({ command, messageId: 'answer', ...fields }));
        } else if (msg.type === 'result' && msg.messageId === 'answer') {
          if (msg.success && msg.result?.result === true) finish();
          else finish(bad(400, 'Vérification refusée par eufy.'));
        }
      } catch { finish(bad(502, 'Réponse du connecteur eufy invalide.')); }
    };
  });
}

export class EufyAdapter extends EventEmitter {
  #socket;
  #retry;
  #heartbeat;
  #running = false;
  #connected = false;
  #pending = new Map();
  #stations = new Map();
  #devices = new Map();
  #streams = new Map();
  #updatedAt = null;
  #auth = { status: 'offline' };
  #answering = false;
  #captchaId;
  #url;
  #serial;
  #credentialPath;
  #generation = 0;
  #connectionRevision = 0;
  #changingGuardMode = false;

  constructor({ url, stationSerial, credentialPath }) {
    super();
    this.#url = url;
    this.#serial = stationSerial || null;
    this.#credentialPath = credentialPath;
  }

  start() {
    if (this.#running) return;
    this.#running = true;
    this.#open();
  }

  stop() {
    this.#running = false;
    this.#generation++;
    clearTimeout(this.#retry);
    this.#disconnect(this.#socket);
  }

  #reconnect() {
    if (this.#running) this.#retry = setTimeout(() => this.#open(), 3000).unref();
  }

  #recordConnectionFailure(station, reason, attempt) {
    delete station.connectionIssue;
    delete station.lastIceAttempt;
    if (!rtcFailures.has(reason)) return;
    station.connectionIssue = reason;
    const report = publicIceAttempt(attempt);
    if (!report) return;
    station.lastIceAttempt = report;
    this.emit('iceAttempt', station.id, reason, report);
  }

  async #open() {
    const generation = this.#generation;
    let socket;
    try {
      const protocols = this.#credentialPath ? await privateProtocols(this.#credentialPath) : undefined;
      if (!this.#running || this.#generation !== generation) return;
      socket = new WebSocket(this.#url, protocols);
    } catch {
      if (this.#generation === generation) this.#reconnect();
      return;
    }
    this.#socket = socket;
    socket.onclose = socket.onerror = () => this.#disconnect(socket);
    socket.onmessage = ({ data }) => {
      if (this.#socket !== socket) return;
      try {
        if (this.#credentialPath && socket.protocol !== driverProtocol) return this.#disconnect(socket);
        const msg = JSON.parse(data);
        if (msg.type === 'version') {
          this.#listen(msg, socket).catch(() => this.#disconnect(socket));
        } else if (msg.type === 'result') {
          const waiter = this.#pending.get(msg.messageId);
          if (!waiter) return;
          if (msg.success === true) waiter.resolve(msg.result);
          else waiter.reject(bad(502, 'Commande refusée par le connecteur eufy.'));
        } else if (msg.type === 'event') {
          this.#event(msg.event);
        }
      } catch {
        this.#disconnect(socket);
      }
    };
    this.#heartbeat = setInterval(() => {
      if (!this.#connected) return this.#disconnect(socket);
      const station = this.#selected();
      if (!station) {
        this.#request('driver.is_connected').catch(() => this.#disconnect(socket));
        return;
      }
      this.#refreshSchedule(station);
      const revision = this.#connectionRevision;
      this.#request('station.is_connected', { serialNumber: station.id }).then(({ connected, reason, iceAttempt, confirmedMode }) => {
        if (this.#selected() !== station || this.#connectionRevision !== revision) return;
        if (station.online !== connected) {
          this.#event({ source: 'station', serialNumber: station.id, event: connected ? 'connected' : 'disconnected', reason, iceAttempt });
        } else if (!connected && reason !== undefined) this.#recordConnectionFailure(station, reason, iceAttempt);
        this.#readConfirmedMode(station, confirmedMode);
      }).catch(() => this.#disconnect(socket));
    }, 30_000);
    this.#heartbeat.unref();
  }

  #disconnect(socket) {
    if (!socket || socket !== this.#socket) return;
    this.#socket = undefined;
    clearInterval(this.#heartbeat);
    for (const waiter of this.#pending.values()) waiter.reject(bad(503, 'Connexion au connecteur interrompue.'));
    for (const id of this.#streams.keys()) this.#endStream(id);
    this.#stations.clear();
    this.#devices.clear();
    this.#connected = false;
    this.emit('udpTargetChanged');
    this.emit('stationConnection');
    this.#auth = { status: 'offline' };
    this.#captchaId = undefined;
    this.#updatedAt = null;
    socket.close();
    this.#reconnect();
  }

  #request(command, fields = {}, timeoutMs = 12_000) {
    if (this.#socket?.readyState !== WebSocket.OPEN) return Promise.reject(bad(503, 'Connecteur eufy indisponible.'));
    const messageId = randomUUID();
    return new Promise((resolve, reject) => {
      const finish = run => value => {
        this.#pending.delete(messageId);
        clearTimeout(timer);
        run(value);
      };
      const done = { resolve: finish(resolve), reject: finish(reject) };
      const timer = setTimeout(() => done.reject(bad(504, 'Délai du connecteur dépassé. Résultat inconnu.')), timeoutMs);
      this.#pending.set(messageId, done);
      try { this.#socket.send(JSON.stringify({ command, messageId, ...fields })); }
      catch { done.reject(bad(503, 'Envoi au connecteur impossible.')); }
    });
  }

  async #listen(version, socket) {
    if (version.minSchemaVersion > 21 || version.maxSchemaVersion < 21) {
      throw new Error('Version WebSocket incompatible');
    }
    await this.#request('set_api_schema', { schemaVersion: 21 });
    await this.#inventory(socket);
  }

  async #inventory(socket) {
    const auth = this.#auth;
    const { state } = await this.#request('start_listening');
    if (socket !== this.#socket) return;
    this.#connected = true;
    if (this.#auth === auth && !['captcha', 'verify_code'].includes(auth.status)) {
      this.#auth = { status: state.driver.connected ? 'connected' : 'disconnected' };
    }
    for (const id of state.stations) this.#add('station', id);
    for (const id of state.devices) this.#add('device', id);
  }

  #selected() {
    if (this.#stations.size !== 1) return null;
    return this.#stations.values().next().value?.entry ?? null;
  }

  #add(target, id) {
    if (typeof id !== 'string' || (target === 'station' && (!id.startsWith('T9000') || (this.#serial && this.#serial !== id)))) return;
    const records = target === 'station' ? this.#stations : this.#devices;
    if (records.has(id)) return;
    const record = { queued: [] };
    records.set(id, record);
    if (target === 'station') this.emit('udpTargetChanged');
    const fields = { serialNumber: id };
    this.#request(target + '.get_properties', fields).then(async values => {
      if (records.get(id) !== record) return;
      const props = values.properties;
      const belongs = this.#serial ? props.stationSerialNumber === this.#serial : props.stationSerialNumber?.startsWith('T9000');
      if (target === 'station' ? props.model !== 'T9000' : !belongs) {
        records.delete(id);
        return;
      }
      const [metadata, status] = await Promise.all([
        this.#request(target + '.get_properties_metadata', fields),
        this.#request(target === 'station' ? 'station.is_connected' : 'device.get_commands', fields),
      ]);
      if (records.get(id) !== record) return;
      record.parent = props.stationSerialNumber;
      record.names = metadata.properties;
      const properties = Object.fromEntries(Object.entries(props).filter(([k,v]) => identity.has(k) && safeValue(v)));
      record.entry = {
        id, model: properties.model ?? '', name: properties.name ?? id,
        properties, reported: {}, settings: readSettings(record.names),
      };
      if (target === 'station') {
        record.udpTarget = diagnosticTarget(id, props.lanIpAddress);
        record.entry.online = status.connected === true;
        record.verifiesMode = Object.hasOwn(status, 'confirmedMode');
        this.#readConfirmedMode(record.entry, status.confirmedMode);
        if (!record.entry.online) this.#recordConnectionFailure(record.entry, status.reason, status.iceAttempt);
      }
      else {
        record.entry.live = status.commands.includes('start_livestream');
        if (['T8P00', 'T8P10', 'T8E00'].includes(properties.model)) record.entry.power = 'poe';
        const motion = record.names.motionDetected;
        if (record.entry.power === 'poe' || (motion?.type === 'boolean' && motion.readable !== false)) record.entry.supportsMotion = true;
        record.entry.kind = record.entry.power === 'poe' || record.entry.live || 'videoStreamingQuality' in record.names ? 'camera'
          : Object.keys(record.names).some(k => /sensorOpen|motionSensor|sensorChangeTime/i.test(k)) ? 'sensor' : 'other';
      }
      for (const name of ['battery', 'guardMode']) {
        if (Object.hasOwn(record.names, name)) rememberReading(record.entry, name, props[name], record.names[name]);
      }
      for (const event of record.queued) this.#event(event);
      delete record.queued;
      if (target === 'station' && this.#selected()?.id === id) {
        this.#refreshSchedule(record.entry);
        if (record.entry.online) this.#refreshInfo(id);
        else this.#request('station.connect', fields).catch(() => {});
      }
    }).catch(() => {
      // An unavailable child must not disconnect the other devices.
      setTimeout(() => {
        if (records.get(id) !== record) return;
        records.delete(id);
        this.#add(target, id);
      }, 15_000).unref();
    });
  }

  #refreshInfo(id) {
    this.#request('station.get_camera_info', { serialNumber: id }).catch(() => {});
  }

  #readConfirmedMode(station, mode) {
    if (station.online && activeModes.has(mode) && station.properties.currentMode !== mode) {
      station.properties.currentMode = mode;
      this.#updatedAt = new Date().toISOString();
    }
  }

  #refreshSchedule(station) {
    const clear = () => {
      delete station.scheduledMode;
      delete station.scheduleTimeZoneSource;
      delete station.scheduleModeSource;
      delete station.reported.currentMode;
    };
    if (station.reported.guardMode !== 2) { clear(); return; }
    this.#request('station.get_scheduled_mode', { serialNumber: station.id }).then(({ scheduledMode, timeZoneSource, modeSource, cloudReportedMode }) => {
      if (this.#selected() !== station || station.reported.guardMode !== 2) return;
      clear();
      if (activeModes.has(cloudReportedMode)) station.reported.currentMode = cloudReportedMode;
      if (activeModes.has(scheduledMode) && ['station','configured'].includes(timeZoneSource)) {
        station.scheduledMode = scheduledMode;
        station.scheduleTimeZoneSource = timeZoneSource;
        if (['station_default', 'documented_default'].includes(modeSource)) station.scheduleModeSource = modeSource;
      }
    }).catch(clear);
  }

  #endStream(id) {
    if (this.#streams.delete(id)) this.emit('videoEnd', id);
  }

  #event(event) {
    const { source, serialNumber: id } = event;
    const action = event.event;
    if (source === 'driver') {
      if (action === 'captcha request') {
        this.#captchaId = event.captchaId;
        const raw = event.captcha;
        const captcha = typeof raw === 'string' && /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(raw)
          ? raw : undefined;
        this.#auth = { status: 'captcha', captcha };
      } else if (['connected', 'disconnected', 'verify code', 'connection error', 'connectionError'].includes(action)) {
        const needsInventory = action === 'connected' && this.#connected && this.#auth.status !== 'connected';
        this.#auth = { status: ({ 'verify code': 'verify_code', 'connection error': 'error', connectionError: 'error' })[action] ?? action };
        if (needsInventory) {
          const socket = this.#socket;
          this.#inventory(socket).catch(() => this.#disconnect(socket));
        }
      }
      this.emit('udpTargetChanged');
      return;
    }
    if (source === 'server' && action === 'shutdown') return this.#disconnect(this.#socket);
    if (!['station', 'device'].includes(source)) return;
    const records = source === 'station' ? this.#stations : this.#devices;
    if (action === source + ' added') return this.#add(source, event[source]);
    if (action === source + ' removed') {
      const selected = source === 'station' && this.#selected()?.id === event.station;
      records.delete(event[source]);
      if (source === 'station') this.emit('udpTargetChanged');
      if (selected) this.emit('stationConnection');
      if (source === 'device') this.#endStream(event.device);
      else for (const [deviceId, record] of this.#devices) {
        if (record.parent === event.station) {
          this.#endStream(deviceId);
          this.#devices.delete(deviceId);
        }
      }
      return;
    }
    const record = records.get(id);
    if (!record) return;
    if (!record.entry) {
      // Preserve changes that arrive between the inventory responses.
      if (record.queued.length < 1024 && !action.startsWith('livestream')) record.queued.push(event);
      return;
    }
    const entry = record.entry;
    if (source === 'station' && action === 'property changed' && event.name === 'lanIpAddress') {
      const target = diagnosticTarget(id, event.value);
      if (record.udpTarget.address !== target.address) {
        record.udpTarget = target;
        this.emit('udpTargetChanged');
      }
      return;
    }
    if (source === 'station' && ['connected', 'disconnected', 'connection error'].includes(action)) {
      this.#connectionRevision++;
      const wasOnline = entry.online;
      entry.online = action === 'connected';
      if (entry.online) this.#recordConnectionFailure(entry);
      else if (wasOnline || action === 'connection error' || event.reason !== undefined) {
        this.#recordConnectionFailure(entry, event.reason, event.iceAttempt);
      }
      if (this.#selected()?.id === id) this.#updatedAt = null;
      if (this.#selected() === entry && (entry.online !== wasOnline || action === 'connection error')) {
        this.emit('stationConnection', rtcFailures.has(event.reason) ? event.reason : undefined);
      }
      for (const r of [record, ...Array.from(this.#devices.values()).filter(d => d.parent === id && d.entry)]) {
        const keepDeviceMotion = r !== record && wasOnline && entry.online;
        r.entry.properties = Object.fromEntries(Object.entries(r.entry.properties).filter(
          ([key]) => identity.has(key) || (key === 'motionDetected' && keepDeviceMotion)
        ));
        r.entry.settings = readSettings(r.names);
        if (!entry.online) this.#endStream(r.entry.id);
      }
      if (entry.online && this.#selected()?.id === id) this.#refreshInfo(id);
      return;
    }
    const station = this.#selected();
    if (!station || (source === 'station' ? id : record.parent) !== station.id) return;
    const previousGuard = entry.reported.guardMode;
    if (action === 'property changed') rememberReading(entry, event.name, event.value, record.names[event.name]);
    if (source === 'station' && action === 'guard mode changed') rememberReading(entry, 'guardMode', event.guardMode, record.names.guardMode);
    if (source === 'station' && entry.reported.guardMode !== previousGuard) this.#refreshSchedule(entry);
    if (!station.online) return;
    if (source === 'device' && action === 'livestream video data' && this.#streams.has(id)) {
      if (event.buffer?.type === 'Buffer' && Array.isArray(event.buffer.data)) {
        this.emit('video', id, Buffer.from(event.buffer.data), event.metadata);
      }
      return;
    }
    if (source === 'device' && (action === 'livestream stopped' || (action === 'command result' && event.command === 'start_livestream' && event.returnCode !== 0))) {
      this.#endStream(id);
      return;
    }
    let name, value;
    if (action === 'property changed') {
      name = event.name;
      value = event.value;
    } else if (source === 'station' && ['current mode changed', 'guard mode changed'].includes(action)) {
      name = action === 'current mode changed' ? 'currentMode' : 'guardMode';
      value = event[name];
    } else if (source === 'device' && Object.hasOwn(deviceReports, action)) {
      name = deviceReports[action];
      value = event.state;
    }
    // Some SDK events also project the configured guard mode into currentMode.
    if (source === 'station' && record.verifiesMode && name === 'currentMode') {
      if (event.confirmed === true) this.#readConfirmedMode(station, value);
      return;
    }
    let meta = Object.hasOwn(record.names, name) && record.names[name];
    // The explicit SDK event carries its own Boolean state even on models with incomplete metadata.
    if (!meta && source === 'device' && action === 'motion detected') meta = { type: 'boolean' };
    if (!meta || meta.readable === false || !safeName(name, meta.type)) return;
    if (source === 'device' && name === 'motionDetected') {
      if (meta.type !== 'boolean' || typeof value !== 'boolean') return;
      entry.supportsMotion = true;
      // The SDK can forward both the property change and the event for a single detection.
      if (value && entry.properties.motionDetected !== true) entry.reported.lastMotionReceivedAt = new Date().toISOString();
    }
    const valid = meta.type === 'object' ? safeObject(value) : typeof value === meta.type && safeValue(value);
    if (!valid) {
      delete entry.properties[name];
      if (meta.type === 'object') delete entry.settings[name];
      return;
    }
    entry.properties[name] = value;
    if (meta.type === 'object' && meta.writeable) entry.settings[name] = { type: 'object', label: safeLabel(meta.label) ? meta.label : name };
    if (name === 'name') entry.name = value;
    this.#updatedAt = new Date().toISOString();
  }

  snapshot() {
    const station = this.#selected();
    const devices = station ? Array.from(this.#devices.values())
      .filter(record => record.parent === station.id && record.entry)
      .map(record => record.entry) : [];
    return structuredClone({ connected: this.#connected, station, devices, auth: this.#auth, updatedAt: this.#updatedAt });
  }

  // Keep the capture address outside the public inventory. Its identity changes
  // when discovery replaces the station or reports a different address.
  get udpDiagnosticTarget() {
    if (!this.#connected || this.#auth.status !== 'connected') return null;
    return this.#stations.get(this.#selected()?.id)?.udpTarget ?? null;
  }

  async testWindowsLanSelection(target) {
    if (!target || target !== this.udpDiagnosticTarget) throw bad(409, 'La HomeBase sélectionnée a changé.');
    if (this.#selected().online) return { status: 'skipped_online' };
    const answer = await this.#request('station.test_lan_path', { serialNumber: target.id }, 70_000);
    if (target !== this.udpDiagnosticTarget) throw bad(409, 'La HomeBase sélectionnée a changé.');
    if (!['connected', 'failed', 'skipped_online', 'busy', 'error'].includes(answer?.status)) return { status: 'error' };
    const result = { status: answer.status };
    if (result.status === 'failed' || result.status === 'error') {
      if (rtcFailures.has(answer.reason) || ['route_unavailable', 'pair_mismatch', 'pair_unverified',
        'trial_timeout', 'trial_unavailable'].includes(answer.reason)) result.reason = answer.reason;
      const report = publicIceAttempt(answer.iceAttempt);
      if (report) result.iceAttempt = report;
    }
    return result;
  }

  #entry(target, id) {
    const station = this.#selected();
    if (!this.#connected || !station?.online) throw bad(503, 'HomeBase T9000 indisponible.');
    if (target === 'station' && station.id === id) return station;
    const record = this.#devices.get(id);
    if (target === 'device' && record?.parent === station.id && record.entry) return record.entry;
    throw bad(404, 'Équipement inconnu sur cette HomeBase.');
  }

  async setProperty(target, id, name, value) {
    if (target === 'station' && name === 'guardMode' && id === this.#selected()?.id) return this.setGuardMode(value);
    const entry = this.#entry(target, id);
    if (!Object.hasOwn(entry.settings, name)) throw bad(400, 'Ce réglage ne peut pas être modifié.');
    if (!validateValue(entry.settings[name], value)) throw bad(400, 'Valeur de réglage invalide.');
    if (entry.settings[name].type === 'object') {
      const current = entry.properties[name];
      if (!current || Array.isArray(current) !== Array.isArray(value) ||
          (!Array.isArray(current) && !Object.keys(current).every(key => Object.hasOwn(value, key)))) {
        throw bad(400, 'La valeur complète du réglage est requise.');
      }
    }
    await this.#request(target + '.set_property', { serialNumber: id, name, value });
    return { submitted: true };
  }

  async setGuardMode(mode, signal) {
    const station = this.#selected();
    if (!this.#connected) throw bad(503, 'Connecteur eufy indisponible.', 'connector_unavailable');
    if (!station) throw bad(503, 'HomeBase T9000 indisponible.', 'homebase_unavailable');
    const setting = station.settings.guardMode;
    if (!Number.isSafeInteger(mode) || mode < 0 || !setting || !validateValue(setting, mode)) {
      throw bad(400, 'Le mode doit être une valeur sélectionnable.');
    }
    if (this.#changingGuardMode) throw bad(409, 'Un changement de mode est déjà en cours.');
    signal?.throwIfAborted();
    this.#changingGuardMode = true;
    try {
      if (!station.online) {
        const failed = new AbortController();
        // The SDK starts its 45 s handshake timer after signaling; allow time for setup and the write.
        const deadline = AbortSignal.timeout(50_000);
        const wait = AbortSignal.any(signal ? [signal, deadline, failed.signal] : [deadline, failed.signal]);
        const connected = once(this, 'stationConnection', { signal: wait });
        this.#request('station.connect', { serialNumber: station.id }).catch(error => {
          // The WS request times out before the SDK's RTC handshake can finish.
          if (error.status !== 504) failed.abort();
        });
        let reason;
        try { [reason] = await connected; } catch { /* Inspect the caller, deadline and station below. */ }
        signal?.throwIfAborted();
        if (!this.#connected) throw bad(503, 'Connexion au connecteur interrompue.', 'connector_unavailable');
        if (this.#selected() !== station) throw bad(503, 'HomeBase T9000 indisponible.', 'homebase_unavailable');
        if (wait.aborted || !station.online) {
          throw bad(503, 'Connexion locale à la HomeBase impossible. Le changement de mode n’a pas été envoyé.',
            reason ?? 'homebase_unreachable');
        }
      }
      if (this.#socket?.readyState !== WebSocket.OPEN) {
        throw bad(503, 'Connecteur eufy indisponible.', 'connector_unavailable');
      }
      try {
        await this.#request('station.set_property', { serialNumber: station.id, name: 'guardMode', value: mode });
      } catch (error) {
        if (error.status === 503 || error.status === 504) error.reason = 'command_unconfirmed';
        throw error;
      }
      return { submitted: true };
    } finally {
      this.#changingGuardMode = false;
    }
  }

  async submitChallenge({ code, captcha }) {
    if (this.#answering) throw bad(409, 'Une vérification eufy est déjà en cours.');
    const socket = this.#socket;
    const challenge = this.#auth;
    const stillPending = () => socket === this.#socket && challenge === this.#auth;
    let command, fields;
    if (this.#auth.status === 'verify_code' && typeof code === 'string' && /^\d{6}$/.test(code)) {
      command = 'driver.set_verify_code';
      fields = { verifyCode: code };
    } else if (this.#auth.status === 'captcha' && typeof captcha === 'string' && captcha.trim() && captcha.length <= 128) {
      command = 'driver.set_captcha';
      fields = { captchaId: this.#captchaId, captcha };
    } else throw bad(400, 'Code invalide ou vérification non demandée.');
    this.#answering = true;
    try {
      await answerChallenge(this.#url, this.#credentialPath, command, fields, stillPending);
      if (stillPending()) {
        this.#auth = { status: 'disconnected' };
        await this.#inventory(socket);
      }
    } finally {
      this.#answering = false;
    }
  }

  async startLive(id, signal) {
    const station = this.#selected();
    const camera = this.#devices.get(id);
    if (station && !station.online && camera?.parent === station.id && camera.entry?.live) {
      this.#request('station.connect', { serialNumber: station.id }).catch(() => {});
      const until = Date.now() + 45_000;
      while (this.#selected() === station && !station.online && Date.now() < until) {
        await delay(250, undefined, { signal });
      }
    }
    signal?.throwIfAborted();
    if (!this.#entry('device', id).live) throw bad(400, 'La caméra ne propose pas de direct.');
    if (this.#streams.has(id)) throw bad(409, 'Ce direct est déjà demandé.');
    const owner = Symbol();
    this.#streams.set(id, owner);
    try { await this.#request('device.start_livestream', { serialNumber: id }); }
    catch (error) {
      if (this.#streams.get(id) === owner) {
        // The start may have taken effect even when its acknowledgement was lost.
        if (error.status === 504) await this.stopLive(id).catch(() => {});
        else this.#endStream(id);
      }
      throw error;
    }
  }

  async stopLive(id) {
    if (!this.#streams.has(id)) return;
    this.#endStream(id);
    await this.#request('device.stop_livestream', { serialNumber: id });
  }
}
