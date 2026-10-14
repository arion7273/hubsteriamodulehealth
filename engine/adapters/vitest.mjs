import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject, pmExec } from '../detect/project.mjs';

export const vitestAdapter = {
  id: 'vitest',
  name: 'Vitest',
  version: '2.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (proj.testRunner !== 'vitest') return { ok: false, reason: 'Vitest not detected; use existing test script if present' };
    const vitestBin = path.join(ctx.repoRoot, 'node_modules/vitest/vitest.mjs');
    return { ok: true, vitestBin, proj };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'vitest', findings: [blockedResult(this, 'code-quality', pf.reason, ctx)] };
    const start = Date.now();
    const vitestBin = path.join(ctx.repoRoot, 'node_modules/vitest/vitest.mjs');
    const { code, stdout, stderr } = await runCommand(
      process.execPath,
      [vitestBin, 'run', '--reporter=json', '--outputFile', path.join(ctx.artifactDir, 'vitest.json')],
      { cwd: ctx.repoRoot, timeoutMs: ctx.budgets?.vitestTimeoutMs ?? 180_000 },
    );
    const findings = [];
    findings.push(
      toFinding(
        {
          tool: 'vitest',
          toolVersion: '2.x',
          pack: 'code-quality',
          checkId: 'vitest.summary',
          status: code === 0 ? STATUS.PASS : STATUS.FAIL,
          severity: code === 0 ? 'info' : 'high',
          title: code === 0 ? 'Vitest tests passed' : 'Vitest tests failed',
          actual: (stderr || stdout).slice(0, 400),
          durationMs: Date.now() - start,
          fingerprint: fingerprint(['vitest', code]),
        },
        ctx,
      ),
    );
    return { tool: 'vitest', findings };
  },
};
