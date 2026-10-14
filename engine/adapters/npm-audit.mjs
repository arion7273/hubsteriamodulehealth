import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject } from '../detect/project.mjs';

export const npmAuditAdapter = {
  id: 'npm-audit',
  name: 'npm audit',
  version: '10.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (!proj.valid) return { ok: false, reason: proj.reason };
    if (proj.packageManager !== 'npm') return { ok: false, reason: 'npm audit requires npm lockfile project' };
    return { ok: true };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'npm-audit', findings: [blockedResult(this, 'security', pf.reason, ctx)] };
    const start = Date.now();
    const { code, stdout } = await runCommand('npm', ['audit', '--json'], {
      cwd: ctx.repoRoot,
      timeoutMs: 90_000,
    });
    const findings = [];
    let audit = {};
    try {
      audit = JSON.parse(stdout || '{}');
    } catch {
      findings.push(
        toFinding(
          {
            tool: 'npm-audit',
            toolVersion: '10.x',
            pack: 'security',
            checkId: 'npm-audit.parse',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'npm audit output parse failed',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['npm-audit', 'parse']),
          },
          ctx,
        ),
      );
      return { tool: 'npm-audit', findings };
    }
    const vulns = audit.metadata?.vulnerabilities ?? {};
    const high = (vulns.high ?? 0) + (vulns.critical ?? 0);
    const threshold = ctx.budgets?.auditMaxHigh ?? 0;
    findings.push(
      toFinding(
        {
          tool: 'npm-audit',
          toolVersion: '10.x',
          pack: 'security',
          checkId: 'npm-audit.summary',
          status: high <= threshold ? STATUS.PASS : STATUS.FAIL,
          severity: high > 0 ? 'high' : 'info',
          title: 'Dependency audit',
          expected: `high+critical <= ${threshold}`,
          actual: JSON.stringify(vulns),
          detail: 'Advisory findings require human triage; not confirmed exploitable.',
          scannerFinding: true,
          durationMs: Date.now() - start,
          fingerprint: fingerprint(['npm-audit', JSON.stringify(vulns)]),
        },
        ctx,
      ),
    );
    return { tool: 'npm-audit', findings };
  },
};
