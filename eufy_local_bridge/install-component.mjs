import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const component = 'eufy_local_bridge';
const receipt = '.eufy-local-bridge.sha256';
const manualReleases = new Set([
  '52ff404114981889157f845a28fcad150dfbb0d45c4568c90c27765cdef018b0', // YAML integration 1.0.0
  '3a968de15af1a6c3918b39ffd93d0060ac174d77b9c2e1d44d8f61d8848740bb', // local ZIP 1.1.0
]);
const conflictMessage = 'Le dossier de l’intégration contient des fichiers différents de la distribution. Sauvegardez puis déplacez ce dossier avant de redémarrer le module.';
const conflict = () => Error(conflictMessage);

async function directoryExists(path) {
  try {
    if (!(await lstat(path)).isDirectory()) throw conflict();
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function fingerprint(dir) {
  const hashes = new Map();
  async function walk(prefix) {
    const entries = await readdir(join(dir, prefix), { withFileTypes: true });
    if (prefix && !entries.length) throw conflict();
    for (const entry of entries) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          const cache = await readdir(join(dir, relative), { withFileTypes: true });
          if (cache.some(file => !file.isFile() || !file.name.endsWith('.pyc'))) throw conflict();
        } else await walk(relative + '/');
      } else {
        if (!entry.isFile()) throw conflict();
        if (relative === receipt) continue;
        const path = join(dir, relative);
        const brandIcon = relative === 'brand/icon.png' || relative === 'brand/icon@2x.png';
        if ((!brandIcon && !/\.(py|json)$/.test(relative)) || (await lstat(path)).size > 1024 * 1024) throw conflict();
        const content = brandIcon ? await readFile(path) : (await readFile(path, 'utf8')).replaceAll('\r\n', '\n');
        hashes.set(relative, createHash('sha256').update(content).digest());
      }
    }
  }
  await walk('');
  const hash = createHash('sha256');
  for (const path of [...hashes.keys()].sort()) hash.update(path + '\0').update(hashes.get(path));
  return hash.digest('hex');
}

async function clearStage(work) {
  const owner = join(work, '.owned-by-eufy-local-bridge');
  if (!(await readdir(work)).length) await writeFile(owner, '', { flag: 'wx', mode: 0o600 });
  if (!(await lstat(owner)).isFile()) throw conflict();
  await chmod(work, 0o700);
  await rm(join(work, 'next'), { recursive: true, force: true });
}

// Production serializes writers with flock on the bind mount shared by all copies of the app.
export async function installComponent(source, core) {
  const components = join(core, 'custom_components');
  if (!await directoryExists(components)) await mkdir(components, { mode: 0o755 });
  const target = join(components, component);
  const work = join(components, '.eufy-local-bridge-install');
  const staged = await directoryExists(work);
  if (staged) await clearStage(work);
  const expected = await fingerprint(source);
  const existing = await directoryExists(target);
  if (existing) {
    const actual = await fingerprint(target);
    const previous = await readFile(join(target, receipt), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (actual === expected) {
      if (previous === null) await writeFile(join(target, receipt), expected, { flag: 'wx', mode: 0o644 });
      return false;
    }
    if (previous !== actual && !manualReleases.has(actual)) throw conflict();
  }

  // Both paths share a filesystem. A single rename (or exchange) publishes a whole release.
  // A stable private staging directory lets the next launch clean up an interrupted update.
  if (!staged) {
    await mkdir(work, { mode: 0o700 });
    await clearStage(work);
  }
  const next = join(work, 'next');
  try {
    await cp(source, next, { recursive: true, errorOnExist: true, force: false });
    await writeFile(join(next, receipt), expected, { flag: 'wx', mode: 0o644 });
    if (existing) execFileSync('mv', ['--exchange', '--no-copy', '-T', '--', next, target], { stdio: 'ignore' });
    else await rename(next, target);
  } finally {
    await rm(next, { recursive: true, force: true });
  }
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.umask(0o022);
  try {
    if (await installComponent('/opt/eufy-component', '/opt/eufy-install/homeassistant')) {
      console.log('Intégration eufy installée ou mise à jour. Redémarrez Home Assistant Core pour la charger.');
    }
  } catch (error) {
    console.error(error.message === conflictMessage ? error.message : 'Installation de l’intégration impossible. Vérifiez le montage du dossier de configuration de Home Assistant et ses permissions.');
    process.exitCode = 1;
  }
}
