import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, rename, unlink } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

const header = Buffer.from('EUFY-SESSION\x01');
const ivLength = 12;
const tagLength = 16;
const maxSize = 1024 * 1024;
const sdkFile = 'persistent.json';

function invalid() { return new Error('Session eufy illisible ou incomplète.'); }

async function optional(operation) {
  try { return await operation; }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

// Read only regular files. Never follow a link from an older SDK directory.
async function readBounded(path, limit) {
  const file = await optional(open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK));
  if (!file) return null;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > limit) throw invalid();
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset !== stat.size) throw invalid();
    return bytes.subarray(0, offset);
  } finally { await file.close(); }
}

async function syncDirectory(path) {
  if (process.platform === 'win32') return; // The production connector runs on Linux.
  const directory = await open(path, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function atomicWrite(path, bytes, createOnly = false) {
  const directory = dirname(path);
  const temporary = join(directory, randomUUID() + '.tmp');
  const file = await open(temporary, 'wx', 0o600);
  try {
    try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
    // link() publishes the key only if another process has not created it first.
    if (createOnly) await link(temporary, path);
    else await rename(temporary, path);
    await syncDirectory(directory);
  } finally { await optional(unlink(temporary)); }
}

function strings(object, names) {
  return Object.fromEntries(names.filter(name => typeof object?.[name] === 'string')
    .map(name => [name, object[name]]));
}

function identity({ username, country }) {
  if (typeof username !== 'string' || username.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username) || typeof country !== 'string' ||
      !/^[A-Z]{2}$/.test(country)) throw invalid();
  return { username, country };
}

function hasSession(p) {
  return Boolean(p?.cloud_token && Number.isSafeInteger(p.cloud_token_expiration) &&
    p.httpApi?.clientPrivateKey && p.httpApi?.serverPublicKey && p.megaApi?.cloud_token &&
    p.megaApi.user_id && Number.isSafeInteger(p.megaApi.cloud_token_expiration));
}

export function isSessionCurrent(p) {
  const now = Date.now();
  return hasSession(p) && p.cloud_token_expiration > now && p.megaApi.cloud_token_expiration > now / 1000 + 60;
}

// Project the pinned SDK's session schema at every boundary, including legacy imports.
// Its legacy and Mega login_hash fields both derive from the original password.
function project({ username, country, persistentData: p }) {
  const account = identity({ username, country });
  if (p?.country !== country || (p.httpApi?.email && p.httpApi.email.toLowerCase() !== username.toLowerCase()) ||
      (p.megaApi?.ab && p.megaApi.ab.toUpperCase() !== country)) throw invalid();
  const httpApi = strings(p.httpApi, ['clientPrivateKey', 'serverPublicKey', 'user_id', 'email', 'nick_name']);
  httpApi.device_public_keys = Object.fromEntries(Object.entries(p.httpApi?.device_public_keys ?? {})
    .filter(([serial, key]) => /^[A-Z0-9-]{6,64}$/.test(serial) && typeof key === 'string'));
  const megaApi = strings(p.megaApi, ['openudid', 'ab', 'cloud_token', 'user_id', 'megaDomain']);
  megaApi.cloud_token_expiration = p.megaApi?.cloud_token_expiration;
  megaApi.domains = Object.fromEntries(Object.entries(p.megaApi?.domains ?? {})
    .filter(([service, host]) => /^[a-z][a-z_0-9]+$/.test(service) && typeof host === 'string' &&
      /^(?:[\w-]+\.)+(?:eufy\.com|eufylife\.com)$/.test(host)));
  megaApi.identities = Object.fromEntries(Object.entries(p.megaApi?.identities ?? {})
    .filter(([host]) => /^app-openapi-[a-z0-9-]+\.eufy\.com$/.test(host))
    .map(([host, value]) => [host, strings(value, ['clientPublicKey', 'keyIdent', 'sharedKey'])]));
  const persistentData = {
    ...strings(p, ['country', 'openudid', 'serial_number', 'cloud_token', 'version', 'fallbackTrustedDeviceName']),
    cloud_token_expiration: p.cloud_token_expiration, httpApi, megaApi,
    push_persistentIds: Array.isArray(p.push_persistentIds) ? p.push_persistentIds.filter(id => typeof id === 'string') : []
  };
  const push = p.push_credentials;
  if (push?.fidResponse?.authToken?.token && push?.checkinResponse?.securityToken && push?.gcmResponse?.token) {
    const { fidResponse, checkinResponse } = push;
    persistentData.push_credentials = {
      fidResponse: {
        ...strings(fidResponse, ['name', 'fid', 'refreshToken']),
        authToken: { ...strings(fidResponse.authToken, ['token', 'expiresIn']),
          expiresAt: Number.isFinite(fidResponse.authToken.expiresAt) ? fidResponse.authToken.expiresAt : 0 }
      },
      checkinResponse: { ...strings(checkinResponse, ['timeMs', 'androidId', 'securityToken', 'versionInfo', 'deviceDataVersionInfo']),
        statsOk: checkinResponse.statsOk === true },
      gcmResponse: strings(push.gcmResponse, ['token'])
    };
  }
  if (!hasSession(persistentData)) throw invalid();
  return { ...account, persistentData };
}

function decode(bytes) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw invalid(); }
  finally { bytes.fill(0); }
}

export function createSessionVault({ dataDir, keyDir }) {
  dataDir = resolve(dataDir);
  keyDir = resolve(keyDir);
  if (dataDir === keyDir || dataDir.startsWith(keyDir + sep) || keyDir.startsWith(dataDir + sep)) {
    throw new Error('La clé de session exige un répertoire distinct.');
  }
  const vaultPath = join(dataDir, 'session.enc');
  const keyPath = join(keyDir, 'session.key');
  const legacyDir = join(dataDir, 'account');

  async function readKey(create) {
    let key = await readBounded(keyPath, 32);
    if (!key && create) {
      await mkdir(keyDir, { mode: 0o700, recursive: true });
      const generated = randomBytes(32);
      try { await atomicWrite(keyPath, generated, true); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      finally { generated.fill(0); }
      key = await readBounded(keyPath, 32);
    }
    if (key?.length !== 32) throw new Error('Clé du coffre eufy absente ou illisible.');
    return key;
  }

  async function readVault() {
    const envelope = await readBounded(vaultPath, maxSize + header.length + ivLength + tagLength);
    if (!envelope) return null;
    if (!envelope.subarray(0, header.length).equals(header) ||
        envelope.length <= header.length + ivLength + tagLength) throw invalid();
    const key = await readKey(false);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, envelope.subarray(header.length, header.length + ivLength));
      decipher.setAAD(header);
      decipher.setAuthTag(envelope.subarray(-tagLength));
      return project(decode(Buffer.concat([decipher.update(envelope.subarray(header.length + ivLength, -tagLength)), decipher.final()])));
    } catch { throw invalid(); }
    finally { key.fill(0); }
  }

  async function save(session) {
    const clean = project(session);
    if (!isSessionCurrent(clean.persistentData)) throw invalid();
    const previous = await readVault(); // An unreadable existing vault must never be overwritten.
    const key = await readKey(!previous);
    const bytes = Buffer.from(JSON.stringify(clean));
    try {
      if (bytes.length > maxSize) throw invalid();
      const iv = randomBytes(ivLength);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(header);
      const encrypted = Buffer.concat([header, iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
      await mkdir(dataDir, { mode: 0o700, recursive: true });
      await atomicWrite(vaultPath, encrypted);
    } finally { key.fill(0); bytes.fill(0); }
  }

  async function saveFromDirectory({ username, country, persistentDir }) {
    const bytes = await readBounded(join(persistentDir, sdkFile), maxSize);
    if (!bytes) return false;
    let session;
    try { session = project({ username, country, persistentData: decode(bytes) }); }
    catch { return false; } // SDK may be partway through its first login/write.
    if (!isSessionCurrent(session.persistentData)) return false;
    await save(session);
    return true;
  }

  async function load() {
    const legacy = await optional(lstat(legacyDir));
    if (!legacy) return readVault();
    if (!legacy.isDirectory()) throw invalid();
    const entries = await readdir(legacyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.tmp$/i.test(entry.name)) await unlink(join(legacyDir, entry.name));
    }
    const configPath = join(legacyDir, 'config.json');
    const config = await readBounded(configPath, 16384);
    let account;
    if (config) {
      try { account = identity(decode(config)); } catch { /* An incomplete old login needs fresh credentials. */ }
      // Remove the old password immediately. This checkpoint lets an interrupted migration retry.
      if (account) await atomicWrite(configPath, JSON.stringify(account));
      else await unlink(configPath);
    }
    let session = await readVault();
    if (account && !session) {
      const hash = createHash('sha256').update(account.country + '/' + account.username.toLowerCase()).digest('hex');
      const persistentDir = join(legacyDir, hash);
      if (entries.some(entry => entry.name === hash && entry.isDirectory())) {
        if (await saveFromDirectory({ ...account, persistentDir })) session = await readVault();
      }
    }
    // Each previous login could leave a separate unencrypted token and password hash.
    for (const entry of entries) {
      if (entry.isDirectory() && /^[0-9a-f]{64}$/.test(entry.name)) {
        const folder = join(legacyDir, entry.name);
        if (await optional(lstat(join(folder, sdkFile)))) {
          await unlink(join(folder, sdkFile));
          await syncDirectory(folder);
        }
      }
    }
    await optional(unlink(configPath));
    await syncDirectory(legacyDir);
    return session;
  }

  async function restoreToDirectory(session, persistentDir) {
    const { persistentData } = project(session);
    const bytes = Buffer.from(JSON.stringify(persistentData));
    try { await atomicWrite(join(persistentDir, sdkFile), bytes); } finally { bytes.fill(0); }
  }

  async function clear() {
    await optional(unlink(vaultPath));
    await syncDirectory(dataDir);
  }
  return { load, save, saveFromDirectory, restoreToDirectory, clear };
}
