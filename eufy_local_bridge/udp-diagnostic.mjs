import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fail } from '../../http-api.mjs';

const probe = '/usr/local/libexec/eufy-udp-probe';
const stunFields = ['requestsSent', 'requestsReceived', 'successesSent', 'successesReceived', 'errorsSent', 'errorsReceived'];

function idle(stationId) {
  return { stationId, status: 'idle', interfaces: [], startedAt: null, finishedAt: null, reason: null };
}

function counters(rows) {
  if (!Array.isArray(rows) || rows.length > 64) throw Error();
  const names = new Set();
  return rows.map(({ name, sent, received }) => {
    if (typeof name !== 'string' || !/^[^\x00-\x20\x7f/]{1,15}$/u.test(name) || names.has(name) ||
        !Number.isSafeInteger(sent) || sent < 0 || !Number.isSafeInteger(received) || received < 0) throw Error();
    names.add(name);
    return { name, sent, received };
  });
}

export class UdpDiagnostic {
  #adapter;
  #spawn;
  #result;
  #active;
  #closed = false;

  constructor(adapter, spawnProbe = spawn) {
    this.#adapter = adapter;
    this.#spawn = spawnProbe;
    adapter.on('udpTargetChanged', this.#checkTarget);
  }

  #checkTarget = () => {
    if (this.#active && this.#active.target !== this.#adapter.udpDiagnosticTarget) this.#abort('station_changed');
  };

  snapshot() {
    const target = this.#adapter.udpDiagnosticTarget;
    if (!target) return undefined;
    return this.#result?.stationId === target.id ? this.#result : idle(target.id);
  }

  start(stationId) {
    if (typeof stationId !== 'string' || !/^T9000[A-Za-z0-9_-]{0,123}$/.test(stationId)) fail(400, 'HomeBase invalide.');
    const target = this.#adapter.udpDiagnosticTarget;
    if (this.#closed || !target) fail(503, 'HomeBase indisponible.');
    if (target.id !== stationId) fail(409, 'La HomeBase sélectionnée a changé.');
    this.#checkTarget();
    if (this.#active) return;
    const startedAt = new Date().toISOString();
    this.#result = { ...idle(stationId), status: 'running', startedAt };
    if (!target.address) {
      this.#result = { ...this.#result, status: 'error', reason: 'address_unavailable', finishedAt: startedAt };
      return;
    }
    let child;
    try {
      child = this.#spawn(probe, [target.address], {
        stdio: ['ignore', 'pipe', 'ignore'], env: {}, timeout: 95_000, killSignal: 'SIGKILL',
      });
    } catch {
      this.#result = { ...this.#result, status: 'error', reason: 'capture_unavailable', finishedAt: startedAt };
      return;
    }
    const run = this.#active = { target, child };
    let ready = false;
    let interfaces;
    let stun;
    let connectionRefused = false;
    // The fixed probe emits one readiness line after installing its filter,
    // and one counter report. Publish a report only after a successful exit.
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => {
      if (run !== this.#active) return;
      try {
        const message = JSON.parse(line);
        if (!ready) {
          if (message?.ready !== true) throw Error();
          this.#checkTarget();
          if (run !== this.#active) return;
          ready = true;
          this.#adapter.connectForUdpDiagnostic(target).catch(error => {
            // A WS acknowledgement may time out before the RTC handshake finishes.
            connectionRefused = error.status !== 504;
          });
        } else {
          if (interfaces) throw Error();
          interfaces = counters(message.interfaces);
          if (message.stun !== undefined) {
            stun = {};
            for (const field of stunFields) {
              const count = message.stun[field];
              if (!Number.isSafeInteger(count) || count < 0) throw Error();
              stun[field] = count;
            }
          }
        }
      } catch { this.#abort('capture_unavailable'); }
    });
    const captureFailed = () => {
      if (run === this.#active) this.#abort('capture_unavailable');
    };
    lines.once('error', captureFailed);
    child.once('error', captureFailed);
    child.once('close', code => {
      lines.close();
      this.#checkTarget();
      if (run !== this.#active) return;
      this.#active = undefined;
      let status = 'error', reason = null;
      if (code !== 0 || !ready || !interfaces) reason = 'capture_unavailable';
      else {
        const sent = interfaces.some(row => row.sent > 0);
        const received = interfaces.some(row => row.received > 0);
        if (sent) status = received ? 'bidirectional' : 'outbound_only';
        else if (received) status = 'inbound_only';
        else if (connectionRefused) reason = 'connection_unavailable';
        else status = 'no_traffic';
      }
      this.#result = { ...this.#result, status, interfaces: code === 0 ? (interfaces ?? []) : [],
        ...(status !== 'error' && stun ? { stun } : {}),
        reason, finishedAt: new Date().toISOString() };
    });
  }

  #abort(reason) {
    const run = this.#active;
    this.#active = undefined;
    this.#result = { ...this.#result, status: 'error', reason, finishedAt: new Date().toISOString() };
    run.child.kill('SIGKILL');
  }

  close() {
    this.#closed = true;
    this.#adapter.off('udpTargetChanged', this.#checkTarget);
    if (this.#active) this.#abort('capture_unavailable');
  }
}
