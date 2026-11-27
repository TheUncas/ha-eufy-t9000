'use strict';

const { openLanTrial } = require('./rtc-lan-trial.cjs');
const active = new Set();

function testSession(session, selection, signal, timeoutFailure) {
  // Reuse the SDK's per-peer LAN hooks for binding, SDP, trickle and retry cleanup.
  // This selection forwards no packets and has no Windows relay registration.
  session.bridgeTrialLan = {
    ...selection,
    close: () => selection.reset(),
    trickle(candidate) {
      const allowed = candidate ? selection.local(candidate) : '';
      if (allowed !== undefined) session.bridgeSendIce(allowed);
    },
  };
  session.signaling.bridgeTrialSignal = signal;
  return new Promise(resolve => {
    let done = false, timer;
    function finish(result) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve(result);
    }
    const onAbort = () => finish(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) return onAbort();
    session.once('connected', () => {
      let pair;
      try { pair = session.peer.pc?.getSelectedCandidatePair(); } catch { /* Some native backends cannot report it. */ }
      if (![pair?.local, pair?.remote].every(endpoint => endpoint?.address && Number.isInteger(endpoint.port) && endpoint.transportType))
        finish({ status: 'failed', reason: 'pair_unverified' });
      else if (selection.matchesPair(pair)) finish({ status: 'connected' });
      else finish({ status: 'failed', reason: 'pair_mismatch' });
    });
    const onError = () => finish({ status: 'failed', reason: 'trial_unavailable' });
    session.on('error', onError); // Late SDK errors after retirement must also be observed.
    session.on('close', () => {
      if (!session.peer.remoteDescriptionSet || !session.bridgeAnswerSent)
        finish({ status: 'failed', reason: 'signaling_unavailable' });
    });
    session.connect().then(() => {
      if (done) return;
      timer = setTimeout(() => {
        const failure = timeoutFailure(session);
        finish({ status: 'failed', reason: failure.bridgeStage,
          ...(failure.bridgeIceAttempt && { iceAttempt: failure.bridgeIceAttempt }) });
      }, 45_000);
    }, onError);
  });
}

module.exports = async function testLanPath(station, Transport, timeoutFailure) {
  const unavailable = { status: 'error', reason: 'trial_unavailable' };
  if (!station.isStationHomeBaseProfessionalS1() || station.terminating) return unavailable;
  if (station.isConnected()) return { status: 'skipped_online' };
  const id = station.getSerial();
  if (active.has(id)) return { status: 'busy' };
  const credentials = station.api.getMegaRtcCredentials();
  if (!credentials?.authToken || !credentials.userId) return unavailable;
  const target = station.getLANIPAddress();
  active.add(id);
  const lifetime = new AbortController();
  const timer = setTimeout(() => lifetime.abort({ status: 'failed', reason: 'trial_timeout' }), 60_000);
  const checkTarget = () => { if (station.getLANIPAddress() !== target) lifetime.abort(unavailable); };
  const online = () => lifetime.abort({ status: 'skipped_online' });
  station.on('property changed', checkTarget);
  station.once('connect', online);
  let session;
  try {
    const selection = await openLanTrial(target, lifetime.signal).catch(() => undefined);
    if (lifetime.signal.aborted) return lifetime.signal.reason;
    if (!selection) return { status: 'failed', reason: 'route_unavailable' };
    // Never attach this session to the station, handoff, command handler or reconnect loop.
    session = new Transport(id, station.rawStation.member.admin_user_id, credentials).createSession();
    session.peer.bridgeStationAddress = () => target;
    return await testSession(session, selection, lifetime.signal, timeoutFailure);
  } catch {
    return lifetime.signal.aborted ? lifetime.signal.reason : unavailable;
  } finally {
    clearTimeout(timer);
    station.off('connect', online);
    station.off('property changed', checkTarget);
    lifetime.abort(unavailable);
    active.delete(id);
    try { session?.close(); } catch {
      try { session.peer.close(); } catch { /* Peer may already be retired. */ }
    }
  }
};
