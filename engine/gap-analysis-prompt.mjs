import { buildExecutiveSummary } from './report-executive-summary.mjs';

/**
 * @param {object} report - normalized run report
 * @returns {string}
 */
export function buildGapAnalysisPrompt(report) {
  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  const coverage = report.coverage;
  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const blocked = (report.findings ?? []).filter((f) => f.status === 'blocked');
  const notRun = (report.findings ?? []).filter((f) =>
    ['not_tested', 'skip', 'not_started'].includes(f.status),
  );

  const lines = [
    '# Module Health — gap analysis and fix plan',
    '',
    `**App:** ${report.appName} (\`${report.appId}\`)`,
    `**Environment:** ${report.environment}`,
    `**Gate:** ${report.gate}`,
    `**Run ID:** ${report.runId}`,
    `**Generated:** ${report.generatedAt ?? 'unknown'}`,
    '',
    '## Executive summary',
    report.headline ?? '',
    exec.coverageNote ? `\nScope note: ${exec.coverageNote}` : '',
    '',
    '### Prioritized issues (blockers → highs → mediums)',
  ];

  if (!exec.items.length) {
    lines.push('- No failing checks in this run scope.');
  } else {
    for (const item of exec.items) {
      lines.push(
        `- **[${item.severity}]** ${item.title} (\`${item.checkId}\`) — ${item.sectionLabel}`,
      );
      if (item.userImpact) lines.push(`  - User impact: ${item.userImpact}`);
      if (item.remediationSummary) lines.push(`  - Fix: ${item.remediationSummary}`);
      if (item.evidenceRefs?.length) lines.push(`  - Evidence: ${item.evidenceRefs.join('; ')}`);
      lines.push(`  - Re-test: Module Health retest checkId \`${item.retestCheckId}\` on run ${report.runId}`);
    }
  }

  lines.push('', '## Run scope (honest coverage)');
  lines.push(`- Input mode: ${report.inputMode}`);
  lines.push(`- Levels: ${(report.levels ?? []).join(', ') || '—'}`);
  lines.push(`- Packs: ${(report.packsExecuted ?? []).join(', ') || '—'}`);
  if (coverage?.categories?.length) {
    lines.push('', '### Categories not executed this run');
    for (const c of coverage.categories.filter((x) => x.status !== 'executed')) {
      lines.push(`- ${c.label}: ${(c.reason ?? '').replace(/\*\*/g, '')}`);
    }
  }

  lines.push('', '## Counts');
  lines.push(JSON.stringify(report.summary?.counts ?? {}, null, 2));

  if (blocked.length) {
    lines.push('', '## Blocked checks');
    for (const f of blocked.slice(0, 15)) {
      lines.push(`- ${f.checkId}: ${f.title} — ${f.actual ?? f.detail ?? ''}`);
    }
  }

  if (notRun.length) {
    lines.push('', '## Not executed in this run');
    for (const f of notRun.slice(0, 15)) {
      lines.push(`- ${f.checkId}: ${f.title} — ${f.detail ?? f.actual ?? ''}`);
    }
  }

  lines.push(
    '',
    '## Your task (Cursor)',
    '1. Triage confirmed fails above — do not invent issues not grounded in this report.',
    '2. Propose fixes in repo order: blockers/highs first, with file-level changes where evidence allows.',
    '3. List coverage gaps separately from confirmed fails (what still needs another Module Health preset).',
    '4. After fixes, specify the exact re-run: preset `comprehensive-build-url` and/or `comprehensive-build-repo`, appId, URL or repo path.',
    '',
    '## Raw fail payloads (for grounding)',
    JSON.stringify(
      fails.map((f) => ({
        id: f.id,
        checkId: f.checkId,
        severity: f.severity,
        title: f.title,
        expected: f.expected,
        actual: f.actual,
        remediation: f.remediation,
        evidence: f.evidence,
      })),
      null,
      2,
    ),
  );

  return lines.join('\n');
}
