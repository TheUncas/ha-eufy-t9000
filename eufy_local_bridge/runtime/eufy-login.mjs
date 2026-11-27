import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { access, chmod, lstat, mkdir, mkdtemp, rename, rm, statfs, unlink, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const driverPath = '/usr/src/app/node_modules/eufy-security-ws/dist/bin/server.js';
const errors = {
  400: 'Vérifiez votre adresse e-mail, votre mot de passe et le pays du compte eufy (deux lettres).',
  409: 'Une connexion eufy est déjà en cours. Réessayez dans quelques secondes.',
  503: 'Le service de connexion eufy est indisponible. Vérifiez que le connecteur est démarré.'
};

const reauthMessages = new Map([
  ['session_expired', 'Session eufy à renouveler. L’échéance enregistrée a été atteinte.'],
  ['account_rejected', 'Session eufy à renouveler. Le service de profil eufy a refusé la session.'],
  ['session_revoked', 'Session eufy à renouveler. Le service eufy Mega a signalé une révocation.'],
  ['login_timeout', 'Connexion eufy à reprendre. Le délai de cinq minutes pour terminer la connexion est écoulé.'],
]);

function logReauth(reason) {
  console.warn(reauthMessages.get(reason) ?? 'Session eufy à renouveler. Motif indisponible.');
}

function failure(status) {
  return Object.assign(new Error(errors[status]), { status });
}

function credentials(input) {
  if (!input || typeof input.email !== 'string' || input.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()) ||
      typeof input.password !== 'string' || !input.password.length || input.password.length > 1024 ||
      typeof input.country !== 'string' || !/^[A-Za-z]{2}$/.test(input.country)) throw failure(400);
  return { username: input.email.trim(), password: input.password, country: input.country.toUpperCase() };
}

export function createEufyLogin({ dataDir }) {
  return async input => {
    credentials(input);
    return new Promise((resolve, reject) => {
      const req = http.request({
        socketPath: join(dataDir, 'login.sock'), path: '/login', method: 'POST',
        signal: AbortSignal.timeout(15000)
      }, res => {
        res.resume();
        if (res.statusCode === 202) resolve();
        else reject(failure(res.statusCode in errors ? res.statusCode : 503));
      });
      req.on('error', () => reject(failure(503)));
      req.end(JSON.stringify({ email: input.email, password: input.password, country: input.country }));
    });
  };
}

export function getLoginStatus(dataDir) {
  return new Promise(resolve => {
    const req = http.get({
      socketPath: join(dataDir, 'login.sock'), path: '/status', signal: AbortSignal.timeout(500)
    }, res => {
      res.resume();
      resolve(({ 202: 'starting', 401: 'reauth_required', 503: 'error' })[res.statusCode] ?? null);
    });
    req.on('error', () => resolve(null));
  });
}

export async function runConnector(driver = driverPath) {
  process.umask(0o077);
  const dataDir = process.env.EUFY_DATA_DIR || '/data/eufy';
  const ipcDir = process.env.EUFY_IPC_DIR || dataDir;
  const { createSessionVault, isSessionCurrent } = await import('./session-vault.mjs');
  const vault = createSessionVault({ dataDir, keyDir: process.env.EUFY_KEY_DIR || '/data/keys' });
  const socket = join(ipcDir, 'login.sock');
  // The SDK works with a plaintext persistent.json. Only a RAM-backed directory may hold it.
  if ((await statfs('/tmp')).type !== 0x01021994) throw Error('Le connecteur nécessite un tmpfs sur /tmp.');
  await mkdir(ipcDir, { recursive: true, mode: 0o700 });
  await access(driver);
  // Rotate once per supervisor lifetime, before the driver can accept a connection.
  const pendingToken = join(ipcDir, randomUUID() + '.tmp');
  await writeFile(pendingToken, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o600 });
  await rename(pendingToken, join(ipcDir, 'driver.token'));
  let active;
  let loginStatus = null;
  let updating = false;
  let stopping = false;
  let storageBlocked = false;
  let retryTimer;
  let retryDelay = 1000;

  function scheduleResume() {
    loginStatus = 'starting';
    retryTimer = setTimeout(async () => {
      if (stopping || storageBlocked) return;
      if (updating) return scheduleResume();
      updating = true;
      try { await restoreSession(); } finally { updating = false; }
    }, retryDelay).unref();
    retryDelay = Math.min(60000, retryDelay * 2);
  }

  async function launch(account, restored) {
    const persistentDir = await mkdtemp('/tmp/eufy-session-');
    const config = { username: account.username, country: account.country, persistentDir, acceptInvitations: false };
    let proc;
    try {
      if (restored) await vault.restoreToDirectory(restored, persistentDir);
      if (stopping) throw failure(503);
      proc = spawn(process.execPath, [driver, '--host', '127.0.0.1', '--port', process.env.EUFY_DRIVER_PORT || '3000', '--quiet'], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
        env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '1', RTC_SKIP_FP_VERIFY: '0' }
      });
    } catch (error) {
      await rm(persistentDir, { recursive: true, force: true });
      throw error;
    }
    const worker = { ownsVault: Boolean(restored), ready: false, finished: false };
    active = worker;
    loginStatus = 'starting';
    let pending = Promise.resolve();
    let killTimer;
    let loginTimer;
    function terminate() {
      if (killTimer) return;
      proc.kill('SIGTERM');
      killTimer = setTimeout(() => proc.kill('SIGKILL'), 5000).unref();
    }
    worker.terminate = terminate;
    function fail(status, reason) {
      if (worker.finished) return;
      worker.finished = true;
      loginStatus = status;
      if (status === 'reauth_required') logReauth(reason);
      terminate();
    }
    if (!restored) loginTimer = setTimeout(() => fail('reauth_required', 'login_timeout'), 5 * 60 * 1000).unref();
    proc.on('error', () => fail('error'));
    proc.on('message', message => {
      pending = pending.then(async () => {
        if (worker.finished) return;
        if (message?.type === 'session-invalid') {
          if (worker.ownsVault) await vault.clear();
          fail('reauth_required', message.reason);
          return;
        }
        if (message?.type !== 'session-ready' && !(worker.ready && message?.type === 'session-updated')) return;
        if (!await vault.saveFromDirectory(config)) {
          fail('error');
          return;
        }
        clearTimeout(loginTimer);
        worker.ready = true;
        worker.ownsVault = true;
        retryDelay = 1000;
        loginStatus = null;
      }).catch(() => {
        storageBlocked = true;
        fail('error');
      });
    });
    worker.done = new Promise(resolve => proc.once('close', async () => {
      clearTimeout(loginTimer);
      clearTimeout(killTimer);
      try {
        await pending;
        await rm(persistentDir, { recursive: true, force: true });
      } catch {
        storageBlocked = true;
        loginStatus = 'error';
        console.error('Impossible de nettoyer le répertoire temporaire du connecteur eufy.');
      } finally {
        active = undefined;
        if (!worker.finished && !worker.stopped && !storageBlocked && !stopping) {
          if (worker.ownsVault) scheduleResume();
          else loginStatus = 'error';
        }
        resolve();
      }
    }));
    const start = { type: 'start', config };
    if (account.password !== undefined) start.password = account.password;
    delete account.password;
    proc.send(start, error => { if (error) fail('error'); });
    delete start.password;
  }

  async function stopDriver() {
    clearTimeout(retryTimer);
    if (!active) return;
    active.stopped = true;
    active.terminate();
    await active.done;
  }

  async function restoreSession() {
    try {
      const session = await vault.load();
      if (session && isSessionCurrent(session.persistentData)) await launch(session, session);
      else if (session) {
        await vault.clear();
        loginStatus = 'reauth_required';
        logReauth('session_expired');
      } else loginStatus = null;
    } catch {
      if (stopping) return;
      storageBlocked = true;
      loginStatus = 'error';
      console.error('Le coffre de session eufy est inaccessible. Vérifiez les volumes de données et de clé.');
    }
  }
  await restoreSession();
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/status') {
      return res.writeHead(({ starting: 202, reauth_required: 401, error: 503 })[loginStatus] ?? 204).end();
    }
    if (req.method !== 'POST' || req.url !== '/login') return res.writeHead(404).end();
    if (updating || stopping) return res.writeHead(409).end();
    if (storageBlocked) return res.writeHead(503).end();
    updating = true;
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) throw failure(400);
        chunks.push(chunk);
      }
      let input;
      try { input = JSON.parse(Buffer.concat(chunks)); } catch { throw failure(400); }
      const account = credentials(input);
      delete input.password;
      for (const chunk of chunks) chunk.fill(0);
      await stopDriver();
      if (stopping || storageBlocked) throw failure(503);
      await launch(account);
      res.writeHead(202).end();
    } catch (error) {
      res.writeHead(error.status || 503).end();
    } finally {
      updating = false;
    }
  });

  // A killed container can leave its Unix socket in the persistent volume.
  const oldSocket = await lstat(socket).catch(error => {
    if (error.code !== 'ENOENT') throw error;
  });
  if (oldSocket?.isSocket()) await unlink(socket);
  server.listen(socket);
  await once(server, 'listening');
  await chmod(socket, 0o600);
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    server.close();
    server.closeAllConnections();
    await stopDriver();
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runConnector().catch(() => {
    console.error('Échec du lancement du connecteur. Vérifiez le volume de données et l’image T9000.');
    process.exitCode = 1;
  });
}
