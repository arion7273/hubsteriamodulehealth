import { prerequisiteLabel } from './finding-classify.mjs';

/**
 * Expand not-run / blocked / unavailable tools with next actions (no silent truncation in model).
 * @param {object} report
 */
export function buildCoverageGapsDetail(report) {
  const findings = report.findings ?? [];
  const notExecuted = findings.filter((f) =>
    ['not_tested', 'skip', 'not_started', 'blocked'].includes(f.status),
  );
  const tools = report.toolInventory ?? [];
  const toolsSkipped = tools.filter((t) => !t.executed);

  const gaps = [];

  for (const f of notExecuted) {
    gaps.push({
      kind: f.status === 'blocked' ? 'blocked' : 'not_executed',
      checkId: f.checkId,
      title: f.title,
      why: prerequisiteLabel(f) ?? f.detail ?? 'Not executed in this run.',
      unknown: f.status === 'blocked'
        ? 'Behavior not validated until prerequisite passes.'
        : 'No pass/fail signal for this area.',
      enable: suggestEnable(f, report),
    });
  }

  for (const t of toolsSkipped) {
    gaps.push({
      kind: 'tool_unavailable',
      checkId: t.tool,
      title: `Tool: ${t.tool}`,
      why: t.executedReason ?? t.configuredReason ?? 'Not executed in this configuration.',
      unknown: 'Results from this tool are missing from the report.',
      enable: t.configuredReason?.includes('repo')
        ? 'Run repository preset with local checkout path configured.'
        : 'Enable pack or tool in settings / use comprehensive preset.',
    });
  }

  if (report.inputMode === 'url') {
    gaps.push({
      kind: 'scope_limit',
      checkId: 'scope.auth',
      title: 'Authenticated workflows',
      why: 'Public URL scan only.',
      unknown: 'Logged-in journeys, role-based UI, and server-side authorization were not verified.',
      enable: 'Configure account refs in secrets and run authenticated URL or workflow recipes.',
    });
  }

  return {
    total: gaps.length,
    gaps,
    honestyNote:
      report.coverage?.honestyNote ??
      'Passes reflect only checks that ran. Public-page scans do not prove database or E2E transaction behavior.',
  };
}

function suggestEnable(f, report) {
  if (f.checkId?.startsWith('eslint.') || f.checkId?.startsWith('typescript.')) {
    return 'Point scan at repository root (repo input mode) or run comprehensive repository preset.';
  }
  if (f.blockedBy) return `Resolve blocker: ${f.blockedBy}, then retest.`;
  if (report.inputMode === 'url') return 'Add repo path or run deeper presets after fixing entry URL issues.';
  return 'Re-run with broader levels/packs or resolve prerequisites.';
}
