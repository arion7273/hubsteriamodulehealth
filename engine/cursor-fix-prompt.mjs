import { buildGapAnalysisPrompt } from './gap-analysis-prompt.mjs';
import { buildExecutiveSummary } from './report-executive-summary.mjs';

/**
 * Cursor-ready prompt: fix remaining issues + progress since prior/first run.
 * @param {object} report - normalized, may include report.comparison
 * @param {object} [opts]
 * @param {string} [opts.baselineRunId] - force baseline (defaults to comparison.firstRunId)
 */
export function buildCursorFixPlanPrompt(report, opts = {}) {
  const comparison = report.comparison;
  const delta = comparison?.vsFirst ?? comparison?.vsPrevious ?? null;
  const baselineRunId =
    opts.baselineRunId ?? comparison?.firstRunId ?? comparison?.previousRunId ?? null;

  const lines = [
    '# Module Health — fix plan for Cursor',
    '',
    `**Current run:** \`${report.runId}\``,
    baselineRunId ? `**Baseline (first in chain):** \`${baselineRunId}\`` : null,
    comparison?.previousRunId ? `**Previous run:** \`${comparison.previousRunId}\`` : null,
    `**App:** ${report.appName} (\`${report.appId}\`)`,
    `**Gate:** ${report.gate}`,
    `**URL:** ${report.meta?.targetUrl ?? '—'}`,
    `**Generated:** ${report.generatedAt ?? '—'}`,
    '',
  ].filter(Boolean);

  if (delta) {
    lines.push('## Progress since baseline', '');
    if (comparison?.headline) lines.push(comparison.headline, '');
    lines.push(
      `| Metric | Count |`,
      `|--------|------:|`,
      `| Fixed (was fail → now pass) | ${delta.counts.fixedCount} |`,
      `| Still failing | ${delta.counts.stillFailingCount} |`,
      `| New failures | ${delta.counts.newFailureCount} |`,
      `| Failing checks (baseline → now) | ${delta.counts.baselineFails} → ${delta.counts.currentFails} |`,
      '',
    );

    if (delta.fixed.length) {
      lines.push('### Fixed since baseline ✅', '');
      for (const row of delta.fixed) {
        lines.push(
          `- \`${row.checkId}\` — ${row.baseline?.title ?? row.checkId} (${row.baseline?.severity ?? ''})`,
        );
        if (row.baseline?.actual) lines.push(`  - Was: ${row.baseline.actual}`);
        if (row.current?.status) lines.push(`  - Now: **${row.current.status}**`);
      }
      lines.push('');
    }

    if (delta.stillFailing.length) {
      lines.push('### Still failing — fix these first', '');
      for (const row of delta.stillFailing) {
        lines.push(`- **[${row.current?.severity ?? 'medium'}]** \`${row.checkId}\` — ${row.current?.title ?? ''}`);
        if (row.current?.actual) lines.push(`  - Observed: ${row.current.actual}`);
        if (row.current?.remediationSummary) lines.push(`  - Fix: ${row.current.remediationSummary}`);
      }
      lines.push('');
    }

    if (delta.newFailures.length) {
      lines.push('### New failures (regressions or newly in scope)', '');
      for (const row of delta.newFailures) {
        lines.push(`- **[${row.current?.severity ?? 'medium'}]** \`${row.checkId}\` — ${row.current?.title ?? ''}`);
        if (row.current?.actual) lines.push(`  - Observed: ${row.current.actual}`);
        if (row.current?.remediationSummary) lines.push(`  - Fix: ${row.current.remediationSummary}`);
      }
      lines.push('');
    }
  } else {
    lines.push(
      '_No prior run linked on this report. Run another scan on the same URL (same packs) to see fixed vs still-open checks._',
      '',
    );
  }

  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  lines.push('## Open issues on this run (all fails)', '');
  if (!exec.items.length) {
    lines.push('- No failing checks in this run scope.', '');
  } else {
    for (const item of exec.items) {
      lines.push(`- **[${item.severity}]** ${item.title} (\`${item.checkId}\`)`);
      if (item.remediationSummary) lines.push(`  - Fix: ${item.remediationSummary}`);
      lines.push(`  - Re-test in Module Health: checkId \`${item.retestCheckId}\``);
    }
    lines.push('');
  }

  lines.push(
    '## Your task (Cursor)',
    '',
    '1. **Celebrate verified fixes** — do not re-open work for checks listed as fixed unless you see a regression.',
    '2. **Implement fixes** for still-failing and new failures using repository evidence (not HTML-only inference for backend/auth).',
    '3. **Acceptance:** each listed `checkId` should **pass** on the next Module Health run with the same URL and packs.',
    '4. **After deploy:** re-run from Module Health landing (same URL) or use “Rerun failed checks” on this report.',
    '',
    '---',
    '',
    '## Full gap analysis (appendix)',
    '',
    buildGapAnalysisPrompt(report),
  );

  return lines.join('\n');
}
