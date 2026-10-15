import { buildGapAnalysisPrompt } from './gap-analysis-prompt.mjs';
import { buildReportAnalysisPrompt } from './report-analysis-prompt.mjs';
import { buildCursorFixPlanPrompt } from './cursor-fix-prompt.mjs';
import { buildCursorFixAllGapsPrompt } from './cursor-fix-all-prompt.mjs';

/**
 * Single markdown file to attach or paste into Cursor for follow-up testing/fixes.
 * @param {object} report - normalized report
 * @param {string} [apiBase]
 */
export function buildCursorExportPack(report, apiBase = 'http://127.0.0.1:4177') {
  const base = apiBase.replace(/\/$/, '');
  const auditMd = report.qaAudit?.markdown ?? '(QA audit not available — restart server and re-open report.)';
  const analysis = buildReportAnalysisPrompt(report, base);
  const gap = buildGapAnalysisPrompt(report);
  const fixPlan = buildCursorFixPlanPrompt(report);
  const fixAll = buildCursorFixAllGapsPrompt(report, { apiBase: base });

  return [
    '# Module Health — Cursor export pack',
    '',
    `**Run ID:** \`${report.runId}\``,
    `**App:** ${report.appName} (\`${report.appId}\`)`,
    `**Gate:** ${report.gate}`,
    `**URL:** ${report.meta?.targetUrl ?? report.qaAudit?.url ?? '—'}`,
    `**Saved on server:** \`data/runs/${report.runId}.json\` and \`data/exports/${report.runId}/\``,
    '',
    '## How to use in Cursor',
    '',
    '1. Attach this file **or** `report.json` from the same export folder.',
    '2. Ask Cursor to triage fails, propose fixes, and suggest the next Module Health run config.',
    '3. Re-run scans locally at `' + base + '` after fixes.',
    '',
    '---',
    '',
    '# Part 1 — Fix ALL issues & gaps (primary Cursor task)',
    '',
    fixAll,
    '',
    '---',
    '',
    '# Part 1b — Progress vs prior runs (if linked)',
    '',
    fixPlan,
    '',
    '---',
    '',
    '# Part 2 — Report analysis task',
    '',
    analysis,
    '',
    '---',
    '',
    '# Part 3 — Gap analysis (detail)',
    '',
    gap,
    '',
    '---',
    '',
    '# Part 4 — QA audit (V5 markdown)',
    '',
    auditMd,
    '',
    '---',
    '',
    '# Part 5 — Full findings JSON (compact)',
    '',
    '```json',
    JSON.stringify(
      {
        runId: report.runId,
        gate: report.gate,
        summary: report.summary,
        executiveSummary: report.executiveSummary,
        coverage: report.coverage,
        findings: report.findings,
      },
      null,
      2,
    ),
    '```',
  ].join('\n');
}
