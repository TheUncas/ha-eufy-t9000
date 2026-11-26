import { timingSafeEqual } from 'node:crypto';

export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function matches(candidate, expected) {
  if (!candidate || candidate.length !== expected.length) return false;
  const value = Buffer.from(candidate);
  const secret = Buffer.from(expected);
  return value.length === secret.length && timingSafeEqual(value, secret);
}

export async function body(req) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    fail(415, 'Le corps de la requête doit être du JSON.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) fail(413, 'Requête trop volumineuse.');
    chunks.push(chunk);
  }
  let data;
  try { data = JSON.parse(Buffer.concat(chunks)); } catch { fail(400, 'JSON invalide.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail(400, 'Objet JSON attendu.');
  return data;
}

export function json(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

export async function accountStatus(auth, loginStatus) {
  if (['captcha', 'verify_code'].includes(auth.status) || !loginStatus) return auth;
  const status = await loginStatus();
  return status && (status !== 'starting' || auth.status !== 'error') ? { status } : auth;
}

export async function changeGuardMode(adapter, req, res, mode) {
  if (!Number.isSafeInteger(mode)) fail(400, 'Le mode doit être un entier annoncé par la base.');
  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once('close', cancel);
  try {
    if (res.destroyed || req.socket.destroyed) cancel();
    await adapter.setGuardMode(mode, controller.signal);
  } finally {
    res.off('close', cancel);
  }
  return json(res, 202, { status: 'submitted' });
}
