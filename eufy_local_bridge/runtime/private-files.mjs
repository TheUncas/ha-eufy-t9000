import { execFile } from 'node:child_process';
import { chmod, open } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

export async function protectPath(path, directory = false) {
  if (process.platform !== 'win32') return chmod(path, directory ? 0o700 : 0o600);
  await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    fileURLToPath(new URL('./scripts/protect-path.ps1', import.meta.url)), path], { windowsHide: true });
}

export async function writePrivateConfig(path, data) {
  const file = await open(path, 'wx', 0o600);
  try {
    await protectPath(path);
    await file.writeFile(JSON.stringify(data, null, 2) + '\n');
  } finally { await file.close(); }
}
