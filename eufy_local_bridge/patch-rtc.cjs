'use strict';

// Apply the HA-specific changes to the audited SDK during the image build.
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const client = 'eufy-security-client/build/';
const ws = 'eufy-security-ws/dist/lib/';

function patch(file, edit) {
  const path = join(process.cwd(), 'node_modules', file);
  let source = readFileSync(path, 'utf8');
  function replace(before, after) {
    if (source.split(before).length !== 2) throw Error('Unexpected RTC build input: ' + file);
    source = source.replace(before, () => after);
  }
  edit(replace, source);
  writeFileSync(path, source);
}

const observation = 'const observe = require("./bridge-ha-rtc-observe.cjs");';
patch(client + 'rtc/stationRtcTransport.js', (replace, source) => {
  const method = source.match(/    async connect\(\) \{[\s\S]*?\n    \}\n(?=    \/\*\*)/);
  if (!method?.[0].includes('this.wirePrimarySession(session);')) throw Error('Unexpected RTC connect method');
  replace('"use strict";', '"use strict";\n' + observation + '\nconst connectPrimary = require("./bridge-ha-rtc-connect.cjs");');
  replace(method[0], '    async connect() {\n        return connectPrimary.call(this, observe.timeoutFailure);\n    }\n');
  // Both initial command sessions and their make-before-break replacements use createSession.
  replace('return new rtcSession_1.RtcSession({', 'const session = new rtcSession_1.RtcSession({');
  replace('region: this.credentials.region,\n        });', `region: this.credentials.region,
        });
        session.peer.bridgeStationAddress = this.bridgeStationAddress;
        const address = this.bridgeStationAddress?.();
        if (address && address !== this.bridgeDirectTarget) session.bridgeLanTarget = address;
        return session;`);
  const handoff = 'await connectAndWaitForRtcSession(newSession, boundedTimeoutMs);';
  replace(handoff, handoff + '\n            if (!this.connected || this.session !== oldSession) throw Error("T9000 RTC handoff retired");');
  replace('const onClose = () => finish(new Error("T9000 RTC handoff closed before connect"));',
    `const onClose = () => {
            if (session.bridgeLanTarget && session.bridgeTrialLan && !session.closed && connectPrimary.canFinishDirect(session)) return;
            finish(new Error("T9000 RTC handoff closed before connect"));
        };`);
  replace('session.on("connected", () => {\n            if (this.connected)', 'session.on("connected", () => {\n            if (this.session !== session || this.connected)');
  replace('const wasConnected = this.connected;\n            this.connected = false;',
    'if (this.connecting && !this.connected && connectPrimary.canFinishDirect(session)) return;\n            const wasConnected = this.connected;\n            this.connected = false;');
  replace('session.on("error", (err) => this.emit("error", err));',
    'session.on("error", (err) => { if (this.session === session) this.emit("error", err); });');
  replace('if (this.session) {\n            try {\n                this.session.close();',
    'const session = this.session;\n        this.session = undefined;\n        if (session) {\n            session.emit("bridgeRetired");\n            try {\n                session.close();');
  replace('            this.session = undefined;\n        }\n    }\n}', '        }\n    }\n}');
});

patch(client + 'rtc/rtcPacket.js', replace => {
  const magic = 'const MAGIC = Buffer.from("XZYH", "ascii");';
  replace(magic, magic + `
const { CommandType } = require("../p2p/types");
exports.bridgePushBody = function (buf) {
    // A standalone portal notice carries the same JSON body as the raw notify channel.
    if (buf.length >= 16 && buf.subarray(0, 4).equals(MAGIC)) {
        const header = parsePortalHeader(buf);
        if (header.isResponse !== 0 || header.commandID !== CommandType.CMD_NOTIFY_PAYLOAD ||
            header.paramLen !== buf.length - 16) return;
        buf = buf.subarray(16);
    }
    if (!buf.length || buf.length > 64 * 1024 || ![0x7b, 0x20, 0x09, 0x0a, 0x0d].includes(buf[0])) return;
    let notice;
    try { notice = JSON.parse(buf.toString("utf8").replace(/\\0+$/, "")); }
    catch { return; }
    if (typeof notice?.cmd !== "number" && typeof notice?.cmd !== "string") return;
    if ([CommandType.CMD_CAMERA_PUSH_NOTIFY, CommandType.CMD_STATION_PUSH_NOTIFY,
        CommandType.CMD_STATION_PUSH_NOTIFY_ALT].includes(Number(notice.cmd))) return buf;
};`);
});

patch(client + 'rtc/rtcPeer.js', replace => {
  replace('"use strict";', '"use strict";\n' + observation + '\nconst { bridgePushBody } = require("./rtcPacket");');
  const notifyFramer = '            if (name === "notify" && this.sctpFramer?.isReady()) {';
  replace(notifyFramer, `            if (name === "notify" || name === "download") {
                const body = bridgePushBody(buf);
                if (body) {
                    this.emit("data", "WebrtcDataChannel", body, name === "notify" ? 3 : 2);
                    return;
                }
            }
` + notifyFramer);
  const create = 'this.pc = new node_datachannel_1.PeerConnection("eufy-ha", rtcConfig);';
  replace(create, create + '\n        const observedPc = this.pc;\n        observe.begin(observedPc, this.bridgeStationAddress);');
  for (const callback of ['onLocalDescription((sdp, type)', 'onLocalCandidate((candidate, mid)',
    'onGatheringStateChange((state)', 'onStateChange((state)', 'onIceStateChange((state)', 'onDataChannel((dc)']) {
    const start = 'this.pc.' + callback + ' => {';
    const record = callback.startsWith('onIceStateChange') ? '\n            observe.iceState(observedPc, state);' : '';
    replace(start, start + '\n            if (this.pc !== observedPc) return;' + record);
  }
  replace('wireDataChannel(name, dc) {', 'wireDataChannel(name, dc) {\n        const channelPc = this.pc;');
  for (const callback of ['onOpen(()', 'onClosed(()', 'onError((err)', 'onMessage((msg)']) {
    const start = 'dc.' + callback + ' => {';
    replace(start, start + '\n            if (this.pc !== channelPc) return;');
  }
  replace('if (!this.pc || !dc.isOpen() || !this.sctpFramer?.isReady())',
    'if (this.pc !== channelPc || !dc.isOpen() || !this.sctpFramer?.isReady())');
  replace('if (!this.pc || !dc.isOpen())', 'if (this.pc !== channelPc || !dc.isOpen())');
  for (const [method, value] of [['setRemoteDescription(offerSdp, "offer")', 'offerSdp'],
    ['setRemoteDescription(answerSdp, "answer")', 'answerSdp'],
    ['addRemoteCandidate(candidate, this.bridgeRemoteMid ?? HUB_SDP_MID)', 'candidate']]) {
    const call = 'this.pc.' + method + ';';
    replace(call, call + '\n            observe.remoteSubmitted(this.pc, ' + value + ');');
  }
  replace('const pair = this.pc.getSelectedCandidatePair();',
    'const pair = this.pc.getSelectedCandidatePair();\n        observe.selectedPair(this.pc, Boolean(pair));');
  replace('this.remoteDescriptionSet = false;\n        this.pendingCandidates = [];',
    'this.remoteDescriptionSet = false;\n        this.bridgeHostOffered = false;\n        this.pendingCandidates = [];');
});

patch(client + 'rtc/rtcSession.js', replace => {
  replace('"use strict";', '"use strict";\n' + observation);
  replace('    async connect() {', `    async connect() {
        if (this.bridgeLanTarget) {
            await require("./rtc-lan-trial.cjs").preparePrimaryLan(this);
            if (this.closed) return;
        }`);
  replace('this.closed = true;\n        this.bridgeEarlyHosts.clear();',
    'this.closed = true;\n        this.bridgeRouteLookup?.abort();\n        this.bridgeEarlyHosts.clear();');
  replace('this.peer.on("commandChannelOpen", () => {\n            if (!this.connected) {',
    `this.peer.on("commandChannelOpen", () => {
            if (!this.connected) {
                if (this.closed) return;
                if (this.bridgeLanTarget && this.bridgeTrialLan && !require("./rtc-lan-trial.cjs").primaryPairMatches(this)) {
                    this.emit("error", Object.assign(Error("T9000 RTC selected LAN pair unavailable"), { bridgeStage: "ice_unavailable" }));
                    return;
                }`);
  replace('this.peer.bridgeWindows = require("./bridge-windows-lan.cjs").openWindowsLan(',
    'this.peer.bridgeWindows = this.bridgeTrialLan ?? require("./bridge-windows-lan.cjs").openWindowsLan(');
  replace('async bridgeReceiveCandidate(candidate) {', `async bridgeReceiveCandidate(candidate) {
        if (this.bridgeTrialLan && !this.peer.pc) {
            candidate = this.bridgeTrialLan.remote(candidate);
            if (!candidate) return;
        }`);
  replace('if (status === 100 && payload.turn) {',
    'if (status === 100 && payload.turn) {\n            if (this.bridgeTrialLan && this.peer.pc) return;');
  for (const wait of ['this.signaling.fetchSign()', 'this.signaling.connect()', 'this.waitForAuth()']) {
    replace('await ' + wait + ';', 'await ' + wait + ';\n        if (this.closed) return;');
  }
  replace('this.peer.close();\n            this.bridgeEarlyHosts.clear();',
    'this.peer.close();\n            this.bridgeAnswerSent = false;\n            this.bridgeEarlyHosts.clear();');
  // The SDK sends station SDP on channel 0 and trickle on 1. Camera sessions specify their channel.
  const candidate = 'if (candidate) this.signaling.sendInfoCandidate(candidate.trim().replace(/^a=/, ""), this.channelId);';
  replace(candidate, 'const trickleChannel = this.opts.channelId ?? 1;\n        ' +
    candidate.replace('this.channelId', 'trickleChannel'));
  replace('else this.signaling.sendInfoEndOfCandidates(this.channelId);',
    'else this.signaling.sendInfoEndOfCandidates(trickleChannel);\n        if (candidate) observe.localAnnounced(this.peer.pc, candidate);');
  const offer = 'const offerSdp = await this.peer.createOffer();';
  replace(offer, 'const offerPc = this.peer.pc;\n            ' + offer);
  replace('if (this.closed || this.sdpHandled) {', 'if (this.closed || this.sdpHandled || this.peer.pc !== offerPc) {');
  replace('logging_1.rootHTTPLogger.info("RtcSession sent client SDP offer"',
    'observe.localAnnounced(offerPc, offerSdp);\n            logging_1.rootHTTPLogger.info("RtcSession sent client SDP offer"');
  const answer = 'const answerSdp = await this.peer.handleRemoteOffer(sdpOffer);';
  replace(answer, 'const answerPc = this.peer.pc;\n            ' + answer);
  replace('const scallJson = this.peer.getCommandChannelScallJson(sendSdp);',
    'if (this.closed || this.peer.pc !== answerPc) return;\n            const scallJson = this.peer.getCommandChannelScallJson(sendSdp);');
  replace('this.bridgeAnswerSent = true;', 'this.bridgeAnswerSent = true;\n            observe.localAnnounced(answerPc, this.bridgeTrialLan ? this.bridgeTrialLan.localSdp(sendSdp) : sendSdp);');
});

patch(client + 'rtc/rtcSignaling.js', replace => {
  replace('const res = await fetch(url, {', 'const res = await fetch(url, {\n            signal: this.bridgeTrialSignal,');
});

patch(client + 'rtc/rtcInbound.js', replace => {
  // The body of a reassembled file-channel push begins with JSON, like a notify-channel push.
  const parse = 'const parsed = (0, rtcPacket_1.parsePortalPacket)(buf, linkType) ??';
  replace(parse, `const decodeLink = linkType === 2 && rtcPacket_1.bridgePushBody(buf) ? 3 : linkType;
    const parsed = (0, rtcPacket_1.parsePortalPacket)(buf, decodeLink) ??`);
  for (const [indent, label] of [['                ', 'station'], ['            ', 'camera']]) {
    const log = '\n' + indent + 'logging_1.rootP2PLogger.info("RtcInbound ' + label + ' push notification"';
    replace('if (innerPayload !== undefined) {' + log,
      'if (innerPayload && typeof innerPayload === "object" && !Array.isArray(innerPayload)) {' + log);
  }
});

patch(client + 'rtc/rtcCommandBridge.js', replace => {
  // A reassembled notification may reuse the segment number of a pending command.
  replace('if (!parsed) {\n            return false;\n        }\n        const pending = this.pending.get(parsed.segmen);',
    'if (!parsed || (parsed.commandID === types_1.CommandType.CMD_NOTIFY_PAYLOAD && parsed.isResponse === 0)) {\n' +
    '            return false;\n        }\n        const pending = this.pending.get(parsed.segmen);');
});

// E40/E41 are generic SDK devices. S4's native Camera handler only recognizes some
// station envelopes. Mirror its motion events for otherwise unhandled local reports.
patch(client + 'eufysecurity.js', replace => {
  const nativeDevicePush = 'device.processPushNotification(station, message, this.config.eventDurationSeconds);';
  replace(nativeDevicePush, 'if (device !== handledDevice) ' + nativeDevicePush);
  replace('station.on("push notification", (_station, message) => this.onPushMessage(message));',
    'station.on("push notification", (source, message) => this.onBridgeStationPush(source, message));');
  replace('    onPushMessage(message) {', `    async onBridgeStationPush(station, message) {
        if (!station.isStationHomeBaseProfessionalS1()) return this.onPushMessage(message);
        const codes = types_3.HB3PairedDevicePushEvent;
        const directMotion = message.event_type === codes.MOTION_DETECTION;
        if (!directMotion && !(this.config.deviceConfig.simultaneousDetections && [
            codes.FACE_DETECTION, codes.PET_DETECTION, codes.VEHICLE_DETECTION,
            codes.IDENTITY_PERSON_DETECTION, codes.STRANGER_PERSON_DETECTION,
        ].includes(message.event_type))) {
            return this.onPushMessage(message);
        }
        if (message.station_sn !== station.getSerial() || !station.isConnected() ||
            typeof message.device_sn !== "string" || !message.device_sn) return;
        const generation = station.rtcConnectionGeneration;
        let device;
        try {
            device = await this.getDevice(message.device_sn);
        } catch {
            return;
        }
        if (device.getStationSerial() !== station.getSerial() || device.getSerial() !== message.device_sn ||
            !station.isConnected() || station.rtcConnectionGeneration !== generation) return;
        if (!["T8P00", "T8P10", "T8E00"].includes(device.getModel())) return this.onPushMessage(message);
        const camera = device instanceof device_1.Camera;
        const motion = types_1.PropertyName.DeviceMotionDetected;
        const firstOnConnection = device.bridgePoeMotionGeneration !== generation;
        device.bridgePoeMotionGeneration = generation;
        if (camera && message.type !== undefined &&
            (message.msg_type === types_1.DeviceType.HB3 || message.msg_type === types_3.HB3PairedDeviceMessageType.SECURITY_EVT)) {
            if (firstOnConnection && device.getPropertyValue(motion) === true) device.updateProperty(motion, true, true);
            this.onPushMessage(message, device);
            device.processPushNotification(station, message, this.config.eventDurationSeconds);
        } else if (camera) device.updateProperty(motion, true, firstOnConnection);
        else device.emit("motion detected", device, true);
        // Keep the SDK's classification timers, but bind motion expiry to the
        // connection that supplied this pulse, including native S4 reports.
        const event = types_1.DeviceEvent.MotionDetected;
        device.clearEventTimeout(event);
        device.eventTimeouts.set(event, setTimeout(() => {
            device.eventTimeouts.delete(event);
            if (station.isConnected() && station.rtcConnectionGeneration === generation) {
                if (camera) device.updateProperty(motion, false);
                else device.emit("motion detected", device, false);
            }
        }, this.config.eventDurationSeconds * 1000));
    }
    onPushMessage(message, handledDevice) {`);
});

patch(client + 'http/station.js', replace => {
  replace('    async connectRtc() {', `    bridgeTestLanPath() {
        return require("../rtc/rtc-trial-runner.cjs")(this, stationRtcTransport_1.StationRtcTransport,
            require("../rtc/bridge-ha-rtc-observe.cjs").timeoutFailure);
    }
    async connectRtc() {`);
  const connected = 'this.rtcTransport.on("connected", () => this.onRtcConnect());';
  replace(connected, 'this.rtcTransport.bridgeStationAddress = () => this.getLANIPAddress();\n            ' + connected);
  replace('this.bridgeRtcFailure = undefined;', 'this.bridgeRtcFailure = undefined;\n        this.bridgeIceAttempt = undefined;');
  replace('onRtcConnectFailed(error) {', 'onRtcConnectFailed(error) {\n        this.bridgeIceAttempt = error.bridgeIceAttempt;');
});
for (const file of ['forward.js', 'station/message_handler.js']) {
  patch(ws + file, replace => {
    replace('reason: station.bridgeRtcFailure,', 'reason: station.bridgeRtcFailure, iceAttempt: station.bridgeIceAttempt,');
    if (file === 'station/message_handler.js')
      replace('case StationCommand.isConnected: {', 'case "station.test_lan_path":\n                return station.bridgeTestLanPath();\n            case StationCommand.isConnected: {');
  });
}
