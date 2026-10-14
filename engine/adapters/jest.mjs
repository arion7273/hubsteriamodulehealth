import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject } from '../detect/project.mjs';

export const jestAdapter = {
  id: 'jest',
  name: 'Jest',
  version: '29.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (proj.testRunner !== 'jest') {
      return { ok: false, reason: 'Jest not detected (use Vitest or npm test script)' };
    }
    const jestBin = path.join(ctx.repoRoot, 'node_modules/jest/bin/jest.js');
    return { ok: true, jestBin };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    const pack = ctx.activePack ?? 'code-quality';
    if (!pf.ok) return { tool: 'jest', findings: [blockedResult(this, pack, pf.reason, ctx)] };
    const start = Date.now();
    const jestBin = path.join(ctx.repoRoot, 'node_modules/jest/bin/jest.js');
    const outFile = path.join(ctx.artifactDir, 'jest.json');
    const { code, stdout, stderr } = await runCommand(
      process.execPath,
      [jestBin, '--json', '--outputFile', outFile, '--passWithNoTests'],
      { cwd: ctx.repoRoot, timeoutMs: ctx.budgets?.jestTimeoutMs ?? 180_000 },
    );
    const findings = [];
    let failed = code !== 0;
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(outFile)) {
        const data = JSON.parse(fs.readFileSync(outFile, 'utf8'));
        failed = (data.numFailedTests ?? 0) > 0 || failed;
      }
    } catch {
      /* use exit code */
    }
    findings.push(
      toFinding(
        {
          tool: 'jest',
          toolVersion: '29.x',
          pack,
          checkId: 'jest.summary',
          status: failed ? STATUS.FAIL : STATUS.PASS,
          severity: failed ? 'high' : 'info',
          title: failed ? 'Jest tests failed' : 'Jest tests passed',
          actual: (stderr || stdout).slice(0, 400),
          durationMs: Date.now() - start,
          fingerprint: fingerprint(['jest', failed ? 'fail' : 'pass']),
        },
        ctx,
      ),
    );
    return { tool: 'jest', findings, artifacts: [{ type: 'jest-json', path: outFile }] };
  },
};
