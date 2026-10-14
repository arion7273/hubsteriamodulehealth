import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject } from '../detect/project.mjs';

export const typescriptAdapter = {
  id: 'typescript',
  name: 'TypeScript',
  version: '5.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (!proj.tsconfig) return { ok: false, reason: 'No tsconfig.json in target repo' };
    const tsc = path.join(ctx.repoRoot, 'node_modules/typescript/bin/tsc');
    return { ok: true, tsc };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'typescript', findings: [blockedResult(this, 'code-quality', pf.reason, ctx)] };
    const start = Date.now();
    const tsc = path.join(ctx.repoRoot, 'node_modules/typescript/bin/tsc');
    const { code, stdout, stderr } = await runCommand(process.execPath, [tsc, '--noEmit', '-p', 'tsconfig.json'], {
      cwd: ctx.repoRoot,
      timeoutMs: ctx.budgets?.tscTimeoutMs ?? 120_000,
    });
    const out = `${stdout}\n${stderr}`.trim();
    const findings = [];
    if (code !== 0) {
      for (const line of out.split('\n').filter((l) => l.includes('error TS')).slice(0, 20)) {
        const m = line.match(/(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/);
        findings.push(
          toFinding(
            {
              tool: 'typescript',
              toolVersion: '5.x',
              pack: 'code-quality',
              checkId: `typescript.${m?.[4] ?? 'error'}`,
              status: STATUS.FAIL,
              severity: 'high',
              title: m?.[5] ?? line,
              file: m?.[1],
              line: m ? Number(m[2]) : undefined,
              actual: line,
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['tsc', line]),
            },
            ctx,
          ),
        );
      }
      if (!findings.length) {
        findings.push(
          toFinding(
            {
              tool: 'typescript',
              toolVersion: '5.x',
              pack: 'code-quality',
              checkId: 'typescript.summary',
              status: STATUS.FAIL,
              severity: 'high',
              title: 'Typecheck failed',
              actual: out.slice(0, 500),
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['tsc', 'fail']),
            },
            ctx,
          ),
        );
      }
    } else {
      findings.push(
        toFinding(
          {
            tool: 'typescript',
            toolVersion: '5.x',
            pack: 'code-quality',
            checkId: 'typescript.summary',
            status: STATUS.PASS,
            severity: 'info',
            title: 'Typecheck passed',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['tsc', 'pass']),
          },
          ctx,
        ),
      );
    }
    return { tool: 'typescript', findings };
  },
};
