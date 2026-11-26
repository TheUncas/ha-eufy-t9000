'use strict';

const { isIPv4 } = require('node:net');
const dgram = require('node:dgram');

// A scall retry can reuse the JS peer wrapper while replacing its native connection.
const attempts = new WeakMap();
// Addresses never enter the report copied into a connection error.
const routes = new WeakMap();
const iceStates = new Set(['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']);
const connected = state => state === 'connected' || state === 'completed';

function begin(pc, stationAddress) {
  attempts.set(pc, { iceCheckingSeen: false, iceFailedSeen: false, iceConnected: false, pairSeen: false,
    localUdpAnnounced: false, remoteUdpSubmitted: false });
  routes.delete(pc);
  let socket;
  const close = () => {
    try { socket?.close(); } catch { /* The socket may already be closed. */ }
  };
  try {
    const station = stationAddress?.();
    if (!isIPv4(station) || !/^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(station)) return;
    const route = { station, localHosts: new Set() };
    routes.set(pc, route);
    // UDP connect selects the kernel's source address without transmitting a datagram.
    socket = dgram.createSocket('udp4');
    socket.unref();
    socket.once('error', close);
    socket.connect(9, station, error => {
      try {
        if (!error) {
          const local = socket.address().address;
          if (isIPv4(local) && local !== '0.0.0.0') route.local = local;
        }
      } catch { /* An unavailable route leaves the comparison unknown. */ }
      finally { close(); }
    });
  } catch { close(); }
}

function iceState(pc, state) {
  const attempt = attempts.get(pc);
  if (!attempt) return;
  if (state === 'checking') attempt.iceCheckingSeen = true;
  else if (state === 'failed') attempt.iceFailedSeen = true;
  else if (connected(state)) attempt.iceConnected = true;
}

function selectedPair(pc, present) {
  const attempt = attempts.get(pc);
  if (attempt && present) attempt.pairSeen = true;
}

function* udpHosts(value) {
  if (typeof value !== 'string') return;
  const lines = value.split(/\r\n|\r|\n/);
  // A standalone trickle message may start with the ICE foundation. SDP uses candidate attributes.
  if (lines.length === 1 && /^[a-z0-9+/]{1,32}[ \t]/i.test(value)) lines[0] = 'candidate:' + value;
  for (const line of lines) {
    const match = /^(?:a=)?candidate:\S+[ \t]+\d+[ \t]+udp[ \t]+\d+[ \t]+(\S+)[ \t]+(\d+)[ \t]+typ[ \t]+host(?:[ \t]|$)/i.exec(line);
    if (match && isIPv4(match[1]) && Number(match[2]) > 0 && Number(match[2]) <= 65535) yield match[1];
  }
}

function localAnnounced(pc, value) {
  const attempt = attempts.get(pc);
  if (!attempt) return;
  const route = routes.get(pc);
  for (const address of udpHosts(value)) {
    attempt.localUdpAnnounced = true;
    route?.localHosts.add(address);
  }
}

function remoteSubmitted(pc, value) {
  const attempt = attempts.get(pc);
  if (!attempt) return;
  const route = routes.get(pc);
  for (const address of udpHosts(value)) {
    attempt.remoteUdpSubmitted = true;
    if (route) attempt.remoteUdpMatchesStation ||= address === route.station;
  }
}

function nativeValue(pc, method) {
  try { return pc?.[method](); } catch { return undefined; }
}

function timeoutFailure(session) {
  const { peer } = session;
  const pc = peer.pc;
  const attempt = attempts.get(pc);
  const ice = nativeValue(pc, 'iceState');
  // The native wrapper returns null when it can affirmatively report no selected pair.
  const pair = nativeValue(pc, 'getSelectedCandidatePair');
  const iceNow = connected(ice);
  iceState(pc, ice);
  selectedPair(pc, Boolean(pair));
  let reason;
  if (!session.turn) reason = 'hub_unreachable';
  else if (!session.sdpHandled) reason = 'offer_unavailable';
  else if (!peer.remoteDescriptionSet || !session.bridgeAnswerSent) reason = 'answer_unavailable';
  else if (nativeValue(pc, 'state') === 'connected') reason = 'command_channel_unavailable';
  else if (pair || iceNow) reason = 'secure_channel_unavailable';
  else if (pair === null && iceStates.has(ice) && (attempt?.pairSeen || attempt?.iceConnected)) reason = 'ice_path_lost';
  else if (pair === undefined) reason = 'peer_unavailable';
  else reason = peer.bridgeHostOffered ? 'ice_unavailable' : 'no_lan_candidate';

  const failure = Object.assign(new Error('T9000 RTC connect timeout'), { bridgeStage: reason });
  if (attempt) {
    failure.bridgeIceAttempt = { ...attempt, finishedAt: new Date().toISOString(), iceState: iceStates.has(ice) ? ice : 'unknown' };
    const route = routes.get(pc);
    if (route?.local && attempt.localUdpAnnounced) failure.bridgeIceAttempt.localUdpMatchesRoute = route.localHosts.has(route.local);
  }
  return failure;
}

module.exports = { begin, iceState, selectedPair, localAnnounced, remoteSubmitted, timeoutFailure };
