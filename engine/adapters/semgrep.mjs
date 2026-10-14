import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { commandExists, runCommand } from './exec.mjs';

export const semgrepAdapter = {
  id: 'semgrep',
  name: 'Semgrep',
  version: '1.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const ok = await commandExists('semgrep', ['--version']);
    if (!ok) return { ok: false, reason: 'semgrep binary not installed on runner' };
    return { ok: true };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    const pack = ctx.activePack ?? 'security';
    if (!pf.ok) return { tool: 'semgrep', findings: [blockedResult(this, pack, pf.reason, ctx)] };
    const start = Date.now();
    const out = path.join(ctx.artifactDir, 'semgrep.json');
    const fs = await import('node:fs');
    const localRules = path.join(ctx.repoRoot, '.semgrep', 'rules.yml');
    const config =
      ctx.budgets?.semgrepConfig ?? (fs.existsSync(localRules) ? localRules : 'p/ci');
    const { code, stderr } = await runCommand(
      'semgrep',
      ['scan', '--config', config, '--json', '--output', out, ctx.repoRoot],
      { timeoutMs: 120_000 },
    );
    const findings = [];
    let results = { results: [] };
    if (fs.existsSync(out)) results = JSON.parse(fs.readFileSync(out, 'utf8'));
    for (const r of (results.results ?? []).slice(0, 25)) {
      findings.push(
        toFinding(
          {
            tool: 'semgrep',
            toolVersion: '1.x',
            rulesetVersion: config,
            pack: pack,
            checkId: `semgrep.${r.check_id ?? 'rule'}`,
            status: STATUS.FAIL,
            severity: r.extra?.severity === 'ERROR' ? 'high' : 'medium',
            title: r.extra?.message ?? r.check_id,
            file: r.path,
            line: r.start?.line,
            actual: r.extra?.lines ?? '',
            scannerFinding: true,
            detail: 'Static rule match — not confirmed vulnerability.',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['semgrep', r.check_id, r.path, r.start?.line]),
          },
          ctx,
        ),
      );
    }
    if (!findings.length) {
      findings.push(
        toFinding(
          {
            tool: 'semgrep',
            toolVersion: '1.x',
            pack: pack,
            checkId: 'semgrep.summary',
            status: code === 0 ? STATUS.PASS : STATUS.FAIL,
            severity: 'info',
            title: code === 0 ? 'Semgrep: no findings' : 'Semgrep completed with issues',
            actual: stderr.slice(0, 200),
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['semgrep', 'summary']),
          },
          ctx,
        ),
      );
    }
    return { tool: 'semgrep', findings };
  },
};
