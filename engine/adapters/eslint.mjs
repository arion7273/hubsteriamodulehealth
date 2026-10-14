import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject } from '../detect/project.mjs';

export const eslintAdapter = {
  id: 'eslint',
  name: 'ESLint',
  version: '9.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (!proj.valid) return { ok: false, reason: proj.reason };
    if (!proj.hasEslint && !proj.eslintConfig) return { ok: false, reason: 'No ESLint config in target repo' };
    return { ok: true, project: proj };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'eslint', findings: [blockedResult(this, 'code-quality', pf.reason, ctx)] };
    const start = Date.now();
    const eslintBin = path.join(ctx.repoRoot, 'node_modules/eslint/bin/eslint.js');
    const lintTargets = ctx.budgets?.eslintPaths ?? ['src'];
    const args = [eslintBin, ...lintTargets, '-f', 'json'];
    const { code, stdout } = await runCommand(process.execPath, args, {
      cwd: ctx.repoRoot,
      timeoutMs: ctx.budgets?.eslintTimeoutMs ?? 90_000,
    });
    const findings = [];
    let data = [];
    try {
      data = JSON.parse(stdout || '[]');
    } catch {
      findings.push(
        toFinding(
          {
            tool: 'eslint',
            toolVersion: '9.x',
            pack: 'code-quality',
            checkId: 'eslint.parse',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'ESLint produced non-JSON output',
            actual: stdout.slice(0, 300),
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['eslint', 'parse']),
          },
          ctx,
        ),
      );
      return { tool: 'eslint', findings };
    }
    for (const file of data) {
      for (const msg of file.messages ?? []) {
        if (msg.severity < 2 && !ctx.budgets?.eslintIncludeWarnings) continue;
        findings.push(
          toFinding(
            {
              tool: 'eslint',
              toolVersion: '9.x',
              pack: 'code-quality',
              checkId: `eslint.${msg.ruleId ?? 'rule'}`,
              status: msg.severity >= 2 ? STATUS.FAIL : STATUS.PASS,
              severity: msg.severity >= 2 ? 'medium' : 'low',
              title: msg.message,
              file: file.filePath,
              line: msg.line,
              actual: `${msg.ruleId} @ ${file.filePath}:${msg.line}`,
              scannerFinding: true,
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['eslint', file.filePath, msg.line, msg.ruleId, msg.message]),
            },
            ctx,
          ),
        );
      }
    }
    if (!findings.length) {
      findings.push(
        toFinding(
          {
            tool: 'eslint',
            toolVersion: '9.x',
            pack: 'code-quality',
            checkId: 'eslint.summary',
            status: code === 0 ? STATUS.PASS : STATUS.FAIL,
            severity: 'info',
            title: code === 0 ? 'ESLint: no errors' : 'ESLint exited with errors',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['eslint', 'summary', code]),
          },
          ctx,
        ),
      );
    }
    return { tool: 'eslint', findings };
  },
};
