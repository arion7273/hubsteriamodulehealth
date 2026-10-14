import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { detectProject } from '../detect/project.mjs';

export const dependencyAuditAdapter = {
  id: 'dependency-audit',
  name: 'Dependency audit',
  version: '1.x',
  inputModes: ['repository'],
  async preflight(ctx) {
    if (!ctx.repoRoot) return { ok: false, reason: 'No repository path configured' };
    const proj = detectProject(ctx.repoRoot);
    if (!proj.valid) return { ok: false, reason: proj.reason };
    if (!['npm', 'pnpm', 'yarn'].includes(proj.packageManager)) {
      return { ok: false, reason: 'Unsupported package manager for audit' };
    }
    return { ok: true, project: proj };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'dependency-audit', findings: [blockedResult(this, 'security', pf.reason, ctx)] };
    const pm = pf.project.packageManager;
    const start = Date.now();
    let stdout = '';
    let code = 0;
    if (pm === 'npm') {
      const r = await runCommand('npm', ['audit', '--json'], { cwd: ctx.repoRoot, timeoutMs: 90_000 });
      stdout = r.stdout;
      code = r.code;
    } else if (pm === 'pnpm') {
      const r = await runCommand('pnpm', ['audit', '--json'], { cwd: ctx.repoRoot, timeoutMs: 90_000 });
      stdout = r.stdout;
      code = r.code;
    } else {
      const r = await runCommand('yarn', ['npm', 'audit', '--json'], { cwd: ctx.repoRoot, timeoutMs: 90_000 });
      stdout = r.stdout;
      code = r.code;
    }

    const findings = [];
    let vulns = {};
    try {
      const audit = JSON.parse(stdout || '{}');
      vulns = audit.metadata?.vulnerabilities ?? audit.vulnerabilities ?? {};
      if (typeof vulns === 'object' && !vulns.high && audit.advisories) {
        vulns = { high: Object.keys(audit.advisories).length };
      }
    } catch {
      findings.push(
        toFinding(
          {
            tool: 'dependency-audit',
            toolVersion: pm,
            pack: 'security',
            checkId: 'dependency-audit.parse',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'Dependency audit output parse failed',
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['audit', 'parse']),
          },
          ctx,
        ),
      );
      return { tool: 'dependency-audit', findings };
    }

    const high = (vulns.high ?? 0) + (vulns.critical ?? 0);
    const threshold = ctx.budgets?.auditMaxHigh ?? 999;
    findings.push(
      toFinding(
        {
          tool: 'dependency-audit',
          toolVersion: pm,
          pack: 'security',
          checkId: 'dependency-audit.summary',
          status: high <= threshold ? STATUS.PASS : STATUS.FAIL,
          severity: high > 0 ? 'high' : 'info',
          title: `${pm} audit`,
          expected: `high+critical <= ${threshold}`,
          actual: JSON.stringify(vulns),
          detail: 'Advisory findings require human triage; not confirmed exploitable.',
          scannerFinding: true,
          durationMs: Date.now() - start,
          fingerprint: fingerprint(['audit', pm, JSON.stringify(vulns)]),
        },
        ctx,
      ),
    );
    return { tool: 'dependency-audit', findings };
  },
};
