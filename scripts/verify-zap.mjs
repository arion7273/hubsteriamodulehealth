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
import { sleep, startScannerServerIfNeeded } from './lib/verify-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

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

async function main() {
  if (process.env.VERIFY_ZAP !== '1') {
    console.log('Skipping ZAP verify (set VERIFY_ZAP=1)');
    return;
  }

  const scannerServer = await startScannerServerIfNeeded(ROOT);

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
  scannerServer.stop();

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
