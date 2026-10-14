import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { commandExists, runCommand } from './exec.mjs';

function redactSecret(s) {
  if (!s || s.length < 8) return '[redacted]';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export const gitleaksAdapter = {
  id: 'gitleaks',
  name: 'Gitleaks',
  version: '8.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const ok = await commandExists('gitleaks', ['version']);
    if (!ok) return { ok: false, reason: 'gitleaks binary not installed on runner' };
    return { ok: true };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'gitleaks', findings: [blockedResult(this, 'security', pf.reason, ctx)] };
    const start = Date.now();
    const reportPath = path.join(ctx.artifactDir, 'gitleaks.json');
    const { code, stdout } = await runCommand(
      'gitleaks',
      ['detect', '--source', ctx.repoRoot, '--report-path', reportPath, '--report-format', 'json', '--no-git'],
      { timeoutMs: 60_000 },
    );
    const findings = [];
    let leaks = [];
    try {
      const fs = await import('node:fs');
      if (fs.existsSync(reportPath)) leaks = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch {
      /* empty */
    }
    for (const leak of leaks.slice(0, 20)) {
      findings.push(
        toFinding(
          {
            tool: 'gitleaks',
            toolVersion: '8.x',
            pack: 'security',
            checkId: `gitleaks.${leak.RuleID ?? 'secret'}`,
            status: STATUS.FAIL,
            severity: 'high',
            title: `Secret pattern detected (${leak.RuleID})`,
            file: leak.File,
            line: leak.StartLine,
            actual: `location ${leak.File}:${leak.StartLine} match=${redactSecret(leak.Secret)}`,
            detail: 'Scanner finding — verify before treating as exploitable leak.',
            scannerFinding: true,
            evidence: [{ type: 'gitleaks-redacted', file: leak.File, line: leak.StartLine }],
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['gitleaks', leak.File, leak.StartLine, leak.RuleID]),
          },
          ctx,
        ),
      );
    }
    if (!findings.length) {
      findings.push(
        toFinding(
          {
            tool: 'gitleaks',
            toolVersion: '8.x',
            pack: 'security',
            checkId: 'gitleaks.summary',
            status: code === 0 ? STATUS.PASS : STATUS.FAIL,
            severity: 'info',
            title: 'Gitleaks: no secrets detected',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['gitleaks', 'pass']),
          },
          ctx,
        ),
      );
    }
    return { tool: 'gitleaks', findings, artifacts: [{ type: 'gitleaks-json', path: reportPath }] };
  },
};
