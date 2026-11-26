import { execFile } from 'node:child_process';
import { randomUUID, X509Certificate, createPrivateKey } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, rmdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { protectPath, writePrivateConfig } from './private-files.mjs';

export async function localCertificate(directory, validityDays = 180) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await protectPath(directory, true);
  const cert = join(directory, 'server.crt');
  const key = join(directory, 'server.key');
  const exists = path => access(path).then(() => true, error => {
    if (error.code === 'ENOENT') return false;
    throw error;
  });
  if (!(await exists(cert)) && !(await exists(key))) {
    // Create both files away from their final names. Parallel initializations must not overwrite a key.
    const staging = join(directory, '.generating');
    await mkdir(staging, { mode: 0o700 });
    try {
      if (await exists(key) || await exists(cert)) throw new Error('Initialisation simultanée. Relancez la commande.');
      const gitOpenSSL = join(process.env.ProgramFiles || 'C:/Program Files', 'Git/usr/bin/openssl.exe');
      const openssl = process.platform === 'win32' && await exists(gitOpenSSL) ? gitOpenSSL : 'openssl';
      await promisify(execFile)(openssl, ['req', '-new', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256',
        '-nodes', '-sha256', '-days', String(validityDays), '-subj', '/CN=Eufy Local Bridge',
        '-addext', 'subjectAltName=IP:127.0.0.1,IP:::1,DNS:localhost',
        '-addext', 'basicConstraints=critical,CA:FALSE', '-addext', 'keyUsage=critical,digitalSignature',
        '-addext', 'extendedKeyUsage=serverAuth', '-out', join(staging, 'server.crt'),
        '-keyout', join(staging, 'server.key')], { windowsHide: true });
      await rename(join(staging, 'server.key'), key);
      await rename(join(staging, 'server.crt'), cert);
    } finally {
      await rm(join(staging, 'server.key'), { force: true });
      await rm(join(staging, 'server.crt'), { force: true });
      await rmdir(staging);
    }
  }
  const x509 = new X509Certificate(await readFile(cert));
  if (x509.ca || !x509.checkIP('127.0.0.1') || !x509.checkPrivateKey(createPrivateKey(await readFile(key)))
      || Date.parse(x509.validTo) <= Date.now()) throw new Error('Certificat local expiré ou incompatible avec la clé.');
  return { cert, key, fingerprint: x509.fingerprint256 };
}

export async function configureLocalHttps(filename) {
  const config = JSON.parse(await readFile(filename, 'utf8'));
  const origin = new URL(config.allowedOrigins[0]);
  if (config.listenHost !== '127.0.0.1' || !['127.0.0.1', 'localhost'].includes(origin.hostname)) {
    throw new Error('Ce certificat est réservé à la boucle locale. Configurez un certificat pour votre nom LAN.');
  }
  const tls = { cert: 'certs/loopback/server.crt', key: 'certs/loopback/server.key' };
  if (config.tls && (config.tls.cert !== tls.cert || config.tls.key !== tls.key)) {
    throw new Error('Un certificat personnalisé est déjà configuré.');
  }
  if (config.allowedOrigins.slice(1).some(value => new URL(value).protocol !== 'https:')) {
    throw new Error('Passez les origines web supplémentaires en HTTPS avant la migration.');
  }
  const pair = await localCertificate(resolve(dirname(filename), 'certs/loopback'));
  origin.protocol = 'https:';
  config.allowedOrigins[0] = origin.origin;
  config.tls = tls;
  const temporary = filename + '.' + randomUUID() + '.tmp';
  try {
    await writePrivateConfig(temporary, config);
    await rename(temporary, filename);
  } finally { await rm(temporary, { force: true }); }
  return pair;
}
