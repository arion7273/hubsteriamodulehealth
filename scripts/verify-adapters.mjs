#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry } from '../server/storage.mjs';
import { commandExists } from '../engine/adapters/exec.mjs';
import { sleep, startScannerServerIfNeeded } from './lib/verify-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SAMPLE_REPO = path.join(ROOT, 'fixtures/sample-repo');

async function installSampleRepo() {
  const r = spawnSync('npm', ['install', '--ignore-scripts'], { cwd: SAMPLE_REPO, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('sample-repo npm install failed');
}

async function main() {
  await installSampleRepo();

  const scannerServer = await startScannerServerIfNeeded(ROOT);

  const baselineScript = path.join(__dirname, 'generate-visual-baseline.mjs');
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
  const loadRecovery = await executeRun(
    {
      runId: 'adapter_load',
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      packs: ['load-recovery'],
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
    },
    registry,
    null,
  );
  if (!loadRecovery.findings.some((f) => f.checkId === 'l5.recovery.restore' && f.status === 'pass')) {
    failures.push('load-recovery: expected recovery restore pass on defect fixture');
  }
  if (!loadRecovery.tools?.some((t) => t.tool === 'k6' && t.status === 'blocked')) {
    failures.push('load-recovery: expected k6 blocked when disabled');
  }

  const jestRepoPath = path.join(ROOT, 'fixtures/jest-repo');
  spawnSync('npm', ['install', '--ignore-scripts'], { cwd: jestRepoPath, stdio: 'inherit' });
  const jestRun = await executeRun(
    {
      runId: 'adapter_jest',
      appId: 'adapter-fixture-repo',
      environment: 'local',
      inputMode: 'repository',
      packs: ['code-quality'],
      repoRoot: jestRepoPath,
    },
    registry,
    null,
  );
  if (!jestRun.findings.some((f) => f.checkId === 'jest.summary' && f.status === 'pass')) {
    failures.push('code-quality: expected Jest pass on jest-repo fixture');
  }
  if (!jestRun.findings.some((f) => f.checkId === 'vitest.preflight' && f.status === 'blocked')) {
    failures.push('code-quality: expected Vitest blocked on jest-only repo');
  }

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

  const { enqueueRun } = await import('../server/run-queue.mjs');
  const job = await enqueueRun({
    appId: 'defect-fixture',
    environment: 'local',
    inputMode: 'url',
    packs: ['quick-health'],
    targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
  });
  for (let i = 0; i < 120; i++) {
    if (job.status === 'completed' || job.status === 'failed') break;
    await sleep(500);
  }
  if (job.status !== 'completed') {
    failures.push(`worker queue: expected completed job, got ${job.status} ${job.message ?? ''}`);
  }

  scannerServer.stop();

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
