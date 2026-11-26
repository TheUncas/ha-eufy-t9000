'use strict';

const { isIPv4 } = require('node:net');

// A scall retry can reuse the JS peer wrapper while replacing its native connection.
const attempts = new WeakMap();
const iceStates = new Set(['new', 'checking', 'connected', 'completed', 'disconnected', 'failed', 'closed']);
const connected = state => state === 'connected' || state === 'completed';

function begin(pc) {
  attempts.set(pc, { iceConnected: false, pairSeen: false, localUdpAnnounced: false, remoteUdpSubmitted: false });
}

function iceState(pc, state) {
  const attempt = attempts.get(pc);
  if (attempt && connected(state)) attempt.iceConnected = true;
}

function selectedPair(pc, present) {
  const attempt = attempts.get(pc);
  if (attempt && present) attempt.pairSeen = true;
}

function hasUdpHost(value) {
  if (typeof value !== 'string') return false;
  for (const line of value.split(/\r?\n/)) {
    const match = /^(?:a=)?candidate:\S+[ \t]+\d+[ \t]+udp[ \t]+\d+[ \t]+(\S+)[ \t]+(\d+)[ \t]+typ[ \t]+host(?:[ \t]|$)/i.exec(line);
    if (match && isIPv4(match[1]) && Number(match[2]) > 0 && Number(match[2]) <= 65535) return true;
  }
  return false;
}

function localAnnounced(pc, value) {
  const attempt = attempts.get(pc);
  if (attempt && !attempt.localUdpAnnounced && hasUdpHost(value)) attempt.localUdpAnnounced = true;
}

function remoteSubmitted(pc, value) {
  const attempt = attempts.get(pc);
  if (attempt && !attempt.remoteUdpSubmitted && hasUdpHost(value)) attempt.remoteUdpSubmitted = true;
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
  }
  return failure;
}

module.exports = { begin, iceState, selectedPair, localAnnounced, remoteSubmitted, timeoutFailure };
