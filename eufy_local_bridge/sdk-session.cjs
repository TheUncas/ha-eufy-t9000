'use strict';

// The supervisor starts exactly one account in each driver process. IPC carries
// the initial secret once and subsequently carries only lifecycle notifications.
let ready = false;
let invalid = false;
let expiryTimer;
let expiresAt;

function notify(type, reason) {
  if (process.connected) process.send(reason === undefined ? { type } : { type, reason });
}

async function readConfig() {
  if (!process.connected) throw Error('Missing connector supervisor');
  process.once('disconnect', () => process.exit(0));
  return new Promise((resolve, reject) => {
    process.once('message', message => {
      if (message?.type !== 'start' || !message.config?.username || !message.config.persistentDir ||
          (message.password !== undefined && (typeof message.password !== 'string' || !message.password))) {
        return reject(Error('Invalid connector startup'));
      }
      const { config } = message;
      config.password = message.password;
      delete message.password;
      resolve(config);
    });
  });
}

function invalidate(reason) {
  if (invalid) return;
  invalid = true;
  clearTimeout(expiryTimer);
  notify('session-invalid', reason);
}

function resumeFailed() {
  if (!ready && !invalid) process.exit(1);
}

function checkExpiry() {
  const remaining = expiresAt - Date.now();
  if (remaining <= 0) return invalidate('session_expired');
  // Refresh deadlines can exceed Node's maximum timer delay.
  expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2 ** 31 - 1)).unref();
}

function afterWrite(driver) {
  if (invalid || !driver.api.isConnected() || !driver.bridgeMegaAuthenticated ||
      !driver.megaApi?.hasValidSession()) return;
  const data = driver.persistentData;
  if (!data.cloud_token || !data.megaApi?.cloud_token) return;
  const deadline = Math.min(data.cloud_token_expiration, (data.megaApi.cloud_token_expiration - 60) * 1000);
  if (!Number.isFinite(deadline)) return invalidate();
  if (deadline <= Date.now()) return invalidate('session_expired');
  if (expiresAt !== deadline) {
    clearTimeout(expiryTimer);
    expiresAt = deadline;
    checkExpiry();
  }
  delete driver.config.password;
  delete driver.api.password;
  notify(ready ? 'session-updated' : 'session-ready');
  ready = true;
}

module.exports = { readConfig, afterWrite, invalidate, resumeFailed };
