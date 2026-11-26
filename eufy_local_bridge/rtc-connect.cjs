'use strict';

function canFinishDirect(session) {
  return Boolean(session.peer?.remoteDescriptionSet && session.bridgeAnswerSent);
}

module.exports = async function connect(timeoutFailure) {
  if (this.connected || this.connecting || this.handoffInProgress) return;
  if (!this.credentials.authToken || !this.credentials.userId) throw Error('T9000 RTC: mega credentials missing');
  const session = this.createSession();
  this.session = session;
  this.connecting = true;
  this.wirePrimarySession(session);

  return new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      session.off('connected', onConnected);
      session.off('error', finish);
      session.off('close', onClose);
      session.off('bridgeRetired', onRetired);
      if (error && this.session === session) {
        this.connecting = false;
        this.closeSession();
      }
      if (error) reject(error);
      else resolve();
    };
    const onConnected = () => { if (this.session === session) finish(); };
    const onRetired = () => finish();
    const onClose = () => {
      // Once the answer is sent, the direct channel can open after signaling closes.
      if (!canFinishDirect(session)) finish(Object.assign(Error('T9000 RTC signaling closed before the answer'), {
        bridgeStage: 'signaling_unavailable',
      }));
    };
    session.on('connected', onConnected);
    session.on('error', finish);
    session.on('close', onClose);
    session.on('bridgeRetired', onRetired);

    // Keep the original handshake window: the sign/auth stage has its own timeouts.
    // Arm the listeners first, so a synchronous event or retirement cannot be missed.
    try {
      session.connect().then(() => {
        if (!settled) timer = setTimeout(() => finish(timeoutFailure(session)), this.connectTimeoutMs);
      }, finish);
    } catch (error) { finish(error); }
  });
};

module.exports.canFinishDirect = canFinishDirect;
