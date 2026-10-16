import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '../..');

/**
 * Ensure Module Health HTTP server is reachable (start ephemeral server if needed).
 * @param {number} [port]
 * @returns {Promise<{ port: number, child: import('node:child_process').ChildProcess | null }>}
 */
export async function ensureLocalServer(port = Number(process.env.PORT) || 4177) {
  const healthUrl = `http://127.0.0.1:${port}/api/health`;
  if (await ping(healthUrl)) return { port, child: null };

  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await ping(healthUrl)) return { port, child };
    await sleep(250);
  }

  child.kill('SIGTERM');
  throw new Error(`Module Health server did not become ready on port ${port}`);
}

async function ping(url) {
  try {
    const res = await fetch(url);
    return res.ok;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
