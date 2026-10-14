#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry } from '../server/storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
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
  const server = spawn('node', ['server/index.mjs'], { cwd: ROOT, stdio: 'inherit' });
  await waitForServer('http://127.0.0.1:4177/api/health');

  const registry = loadRegistry();
  const home = await executeRun(
    {
      runId: 'verify_home',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [1],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
    },
    registry,
    null,
  );

  const errorPage = await executeRun(
    {
      runId: 'verify_error',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [1],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/error.html',
    },
    registry,
    null,
  );

  const mobile = await executeRun(
    {
      runId: 'verify_mobile',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [4],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/mobile.html',
    },
    registry,
    null,
  );

  const delayed = await executeRun(
    {
      runId: 'verify_delayed',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [1],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/delayed-render.html',
    },
    registry,
    null,
  );

  const emptyRoot = await executeRun(
    {
      runId: 'verify_empty',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [1],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/empty-root.html',
    },
    registry,
    null,
  );

  const a11y = await executeRun(
    {
      runId: 'verify_a11y',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [4],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/a11y.html',
    },
    registry,
    null,
  );

  server.kill('SIGTERM');

  const failedChecks = [];
  const assertFail = (report, checkId) => {
    const f = report.findings.find((x) => x.checkId === checkId && x.status === 'fail');
    if (!f) failedChecks.push(`Expected fail: ${checkId} in ${report.runId}`);
  };
  const assertPass = (report, checkId) => {
    const f = report.findings.find((x) => x.checkId === checkId && x.status === 'pass');
    if (!f) failedChecks.push(`Expected pass: ${checkId} in ${report.runId}`);
  };

  assertPass(home, 'l1.readiness.application');
  assertFail(home, 'l1.links.broken');
  assertPass(home, 'l1.reachability.http-status');
  assertFail(errorPage, 'l1.js.uncaught-error');
  assertPass(delayed, 'l1.readiness.application');
  const emptyReady = emptyRoot.findings.find((f) => f.checkId === 'l1.readiness.application');
  if (!emptyReady || emptyReady.status === 'pass') {
    failedChecks.push('Expected empty-root readiness to fail or block, not pass');
  }
  assertFail(mobile, 'l4.layout.overflow.mobile');
  const a11yFail = a11y.findings.some((f) => f.checkId.startsWith('l4.a11y.') && f.status === 'fail');
  if (!a11yFail) failedChecks.push('Expected axe violation on a11y fixture');

  if (failedChecks.length) {
    console.error('Platform verification failed:\n', failedChecks.join('\n'));
    process.exit(1);
  }
  console.log('Platform verification passed (defect fixture detection).');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
