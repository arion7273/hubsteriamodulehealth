#!/usr/bin/env node
/**
 * Optional ZAP verification — requires Docker and pulls zaproxy image.
 * Usage: VERIFY_ZAP=1 npm run verify:zap
 */
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry } from '../server/storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitZap(apiUrl) {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${apiUrl}/JSON/core/view/version/`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(1000);
  }
  throw new Error('ZAP did not become ready');
}

async function waitForServer(url, attempts = 40) {
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

async function main() {
  if (process.env.VERIFY_ZAP !== '1') {
    console.log('Skipping ZAP verify (set VERIFY_ZAP=1)');
    return;
  }

  let server = null;
  try {
    await waitForServer('http://127.0.0.1:4177/api/health', 3);
  } catch {
    server = spawn('node', ['server/index.mjs'], { cwd: ROOT, stdio: 'inherit' });
    await waitForServer('http://127.0.0.1:4177/api/health');
  }

  const apiUrl = 'http://127.0.0.1:8090';
  const docker = spawn(
    'docker',
    ['run', '--rm', '-p', '8090:8080', 'ghcr.io/zaproxy/zaproxy:stable', 'zap.sh', '-daemon', '-port', '8080', '-host', '0.0.0.0'],
    { stdio: 'ignore', detached: true },
  );

  process.env.ZAP_PASSIVE_ENABLED = 'true';
  process.env.ZAP_API_URL = apiUrl;

  await waitZap(apiUrl);

  const registry = loadRegistry();
  const report = await executeRun(
    {
      runId: 'verify_zap',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['security'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
    },
    registry,
    null,
  );

  docker.kill('SIGTERM');
  if (server) server.kill('SIGTERM');

  const zapTool = report.tools?.find((t) => t.tool === 'zap');
  if (!zapTool || zapTool.status !== 'completed') {
    console.error('ZAP tool did not complete', report.tools);
    process.exit(1);
  }
  console.log('ZAP verification passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
