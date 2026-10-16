import { spawn } from 'node:child_process';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * @param {string} url
 * @param {number} [attempts]
 */
export async function waitForServer(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error('Server did not start');
}

const DEFAULT_HEALTH_URL = 'http://127.0.0.1:4177/api/health';

/**
 * Start Module Health server when not already listening (verify scripts / ZAP).
 * @param {string} repoRoot
 * @param {string} [healthUrl]
 */
export async function startScannerServerIfNeeded(repoRoot, healthUrl = DEFAULT_HEALTH_URL) {
  let server = null;
  let startedServer = false;
  try {
    await waitForServer(healthUrl, 3);
  } catch {
    server = spawn('node', ['server/index.mjs'], { cwd: repoRoot, stdio: 'inherit' });
    startedServer = true;
    await waitForServer(healthUrl);
  }
  return {
    server,
    startedServer,
    stop() {
      if (startedServer && server) server.kill('SIGTERM');
    },
  };
}
