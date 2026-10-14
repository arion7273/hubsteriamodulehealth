#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry } from '../server/storage.mjs';
import { commandExists } from '../engine/adapters/exec.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SAMPLE_REPO = path.join(ROOT, 'fixtures/sample-repo');

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

async function installSampleRepo() {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync('npm', ['install', '--ignore-scripts'], { cwd: SAMPLE_REPO, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('sample-repo npm install failed');
}

async function main() {
  await installSampleRepo();

  let server = null;
  let startedServer = false;
  try {
    await waitForServer('http://127.0.0.1:4177/api/health', 3);
  } catch {
    server = spawn('node', ['server/index.mjs'], { cwd: ROOT, stdio: 'inherit' });
    startedServer = true;
    await waitForServer('http://127.0.0.1:4177/api/health');
  }

  const baselineScript = path.join(__dirname, 'generate-visual-baseline.mjs');
  const { spawnSync } = await import('node:child_process');
  spawnSync('node', [baselineScript], { cwd: ROOT, stdio: 'inherit' });

  const registry = loadRegistry();
  const failures = [];

  const quick = await executeRun(
    {
      runId: 'adapter_quick',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['quick-health'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/error.html',
    },
    registry,
    null,
  );
  if (!quick.findings.some((f) => f.checkId === 'l1.js.uncaught-error' && f.status === 'fail')) {
    failures.push('quick-health pack: expected JS error finding');
  }

  const ui = await executeRun(
    {
      runId: 'adapter_ui',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['ui-a11y'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/a11y.html',
    },
    registry,
    null,
  );
  if (!ui.findings.some((f) => f.checkId.startsWith('axe.rule.') && f.status === 'fail')) {
    failures.push('ui-a11y pack: expected axe violation');
  }

  const visualOk = await executeRun(
    {
      runId: 'adapter_visual_ok',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['ui-a11y'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/visual-regression.html',
    },
    registry,
    null,
  );
  const visualFinding = visualOk.findings.find((f) => f.checkId === 'l4.visual.baseline');
  if (!visualFinding || visualFinding.status !== 'pass') {
    failures.push('ui-a11y pack: expected visual baseline pass on stable fixture');
  }

  const visualBad = await executeRun(
    {
      runId: 'adapter_visual_bad',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['ui-a11y'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/visual-regression-broken.html',
    },
    registry,
    null,
  );
  const visualFail = visualBad.findings.find((f) => f.checkId === 'l4.visual.baseline');
  if (!visualFail || visualFail.status !== 'fail') {
    failures.push('ui-a11y pack: expected visual regression fail on broken fixture');
  }

  const code = await executeRun(
    {
      runId: 'adapter_code',
      appId: 'adapter-fixture-repo',
      environment: 'local',
      inputMode: 'repository',
      packs: ['code-quality'],
      repoRoot: SAMPLE_REPO,
    },
    registry,
    null,
  );
  if (!code.findings.some((f) => f.checkId.startsWith('eslint.') && f.status === 'fail')) {
    failures.push('code-quality: expected ESLint failure');
  }
  if (!code.findings.some((f) => f.checkId.startsWith('typescript.') && f.status === 'fail')) {
    failures.push('code-quality: expected TypeScript failure');
  }
  if (!code.findings.some((f) => f.checkId === 'vitest.summary' && f.status === 'pass')) {
    failures.push('code-quality: expected Vitest pass');
  }

  const security = await executeRun(
    {
      runId: 'adapter_security',
      appId: 'adapter-fixture-repo',
      environment: 'local',
      inputMode: 'repository',
      packs: ['security'],
      repoRoot: SAMPLE_REPO,
    },
    registry,
    null,
  );
  if (!(await commandExists('gitleaks', ['version']))) {
    if (!security.findings.some((f) => f.checkId === 'gitleaks.preflight' && f.status === 'blocked')) {
      failures.push('security: expected gitleaks blocked when binary missing');
    }
  } else if (!security.findings.some((f) => f.checkId.startsWith('gitleaks.') && f.status === 'fail')) {
    failures.push('security: expected gitleaks secret finding');
  }

  if (await commandExists('semgrep', ['--version'])) {
    if (!code.findings.some((f) => f.checkId.startsWith('semgrep.') && f.status === 'fail')) {
      failures.push('code-quality: expected semgrep eval rule failure');
    }
  } else if (!code.findings.some((f) => f.checkId === 'semgrep.preflight' && f.status === 'blocked')) {
    failures.push('code-quality: expected semgrep blocked when binary missing');
  }

  const htmlMode = await executeRun(
    {
      runId: 'adapter_html',
      appId: 'adhoc-url-scan',
      environment: 'custom',
      inputMode: 'html',
      packs: ['security', 'code-quality'],
      htmlSnapshot: { html: '<html><body>ok</body></html>' },
    },
    registry,
    null,
  );
  if (!htmlMode.findings.some((f) => f.status === 'not_applicable' || f.status === 'blocked')) {
    failures.push('HTML mode: expected repository tools not applicable/blocked');
  }

  if (startedServer && server) server.kill('SIGTERM');

  if (failures.length) {
    console.error('Adapter verification failed:\n', failures.join('\n'));
    process.exit(1);
  }
  console.log('Adapter verification passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
