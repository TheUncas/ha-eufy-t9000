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
  replace('wirePrimarySession(session) {',
    'wirePrimarySession(session) {\n        session.peer.bridgeStationAddress = this.bridgeStationAddress;');
  replace('session.on("connected", () => {\n            if (this.connected)', 'session.on("connected", () => {\n            if (this.session !== session || this.connected)');
  replace('const wasConnected = this.connected;\n            this.connected = false;',
    'if (this.connecting && !this.connected && connectPrimary.canFinishDirect(session)) return;\n            const wasConnected = this.connected;\n            this.connected = false;');
  replace('session.on("error", (err) => this.emit("error", err));',
    'session.on("error", (err) => { if (this.session === session) this.emit("error", err); });');
  replace('if (this.session) {\n            try {\n                this.session.close();',
    'const session = this.session;\n        this.session = undefined;\n        if (session) {\n            session.emit("bridgeRetired");\n            try {\n                session.close();');
  replace('            this.session = undefined;\n        }\n    }\n}', '        }\n    }\n}');
});

patch(client + 'rtc/rtcPeer.js', replace => {
  replace('"use strict";', '"use strict";\n' + observation);
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
