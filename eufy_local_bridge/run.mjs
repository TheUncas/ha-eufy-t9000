import https from 'node:https';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { chmod, chown, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { EufyAdapter } from '../../adapter.mjs';
import { createEufyLogin, getLoginStatus } from '../../eufy-login.mjs';
import { localCertificate } from '../../local-https.mjs';
import { Video } from '../../video.mjs';
import { addonHandler, port } from './api.mjs';

async function run() {
  process.umask(0o077);
  const mount = '/opt/eufy-install/homeassistant';
  if (!(await readFile('/proc/self/mountinfo', 'utf8')).split('\n').some(line => line.split(' ')[4] === mount)) {
    console.error('Le dossier de configuration Home Assistant doit être monté par le Supervisor.');
    process.exitCode = 1;
    return;
  }
  // UID 1000 must not traverse this parent, even when Core's own files grant world access.
  const boundary = await lstat('/opt/eufy-install');
  if (!boundary.isDirectory() || boundary.uid !== 0 || (boundary.mode & 0o777) !== 0o700) {
    console.error('Le montage de la configuration Home Assistant doit être isolé derrière un répertoire root privé.');
    process.exitCode = 1;
    return;
  }
  const install = spawnSync('flock', [mount, process.execPath, fileURLToPath(new URL('./install-component.mjs', import.meta.url))],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (install.error) throw install.error;
  if (install.status !== 0) {
    process.exitCode = 1;
    return;
  }
  const { pairing_key: token } = JSON.parse(await readFile('/data/options.json', 'utf8'));
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) {
    console.error('Configurez la clé d’appairage du module (32 à 128 caractères parmi A-Z, a-z, 0-9, _ et -).');
    process.exitCode = 1;
    return;
  }
  // Supervisor owns /data and its options. Only the app's private directories need a writable owner.
  for (const path of ['/data/eufy', '/data/keys', '/data/tls']) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    if (!(await lstat(path)).isDirectory()) throw Error('Répertoire privé invalide.');
    await chown(path, 1000, 1000);
    await chmod(path, 0o700);
  }
  await chmod('/data/options.json', 0o600);
  await chmod('/data', 0o711);
  process.setgroups([]);
  process.setgid(1000);
  process.setuid(1000);
  const cert = await localCertificate('/data/tls', 3650);
  const ipc = await mkdtemp('/tmp/eufy-api-');
  const driverPort = '18788';
  const adapter = new EufyAdapter({ url: 'ws://127.0.0.1:' + driverPort, stationSerial: '', credentialPath: ipc + '/driver.token' });
  const video = new Video(adapter, []);
  const server = https.createServer({
    cert: await readFile(cert.cert), key: await readFile(cert.key), minVersion: 'TLSv1.2'
  }, addonHandler({ token, adapter, login: createEufyLogin({ dataDir: ipc }), loginStatus: () => getLoginStatus(ipc), video }));
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  const child = spawn(process.execPath, ['/opt/bridge/eufy-login.mjs'], {
    cwd: '/usr/src/app', stdio: ['ignore', 'ignore', 'inherit'],
    env: {
      PATH: process.env.PATH, TZ: process.env.TZ || 'UTC',
      EUFY_DATA_DIR: '/data/eufy', EUFY_KEY_DIR: '/data/keys', EUFY_IPC_DIR: ipc, EUFY_DRIVER_PORT: driverPort,
      EUFY_SCHEDULE_TIME_ZONE: process.env.TZ || 'UTC', RTC_NO_TURN: '1', RTC_CLIENT_OFFER: '0',
      RTC_HANDOFF: '1', RTC_SCTP_MAX_PACKET_BYTES: '800', RTC_HANDSHAKE_PACE_MS: '0.6',
      RTC_PROACTIVE_RECONNECT_MS: '270000', RTC_SWIPE_WAKE: '0', RTC_LIVE_WAKE: '0'
    }
  });
  let stopping = false;
  function stop() {
    if (stopping) return;
    stopping = true;
    video.close();
    adapter.stop();
    server.close();
    server.closeAllConnections();
    child.kill('SIGTERM');
  }
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    adapter.start();
    console.log('Empreinte publique SHA-256 à saisir dans Home Assistant : ' + cert.fingerprint);
    await once(child, 'close');
    if (!stopping) throw Error('Connecteur arrêté.');
  } finally {
    stop();
    await rm(ipc, { recursive: true, force: true });
  }
}

run().catch(() => {
  console.error('Démarrage ou exécution du module interrompu. Vérifiez le stockage du module et les ports locaux 18787 et 18788.');
  process.exitCode = 1;
});
