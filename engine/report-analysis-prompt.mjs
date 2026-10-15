import { buildExecutiveSummary } from './report-executive-summary.mjs';
import { presetToRunTestQuery, RUN_PRESETS } from './run-presets.mjs';

const SEVERITY_ORDER = { blocker: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Cursor instructions for interpreting one Module Health report (any app, local or hosted UI).
 *
 * @param {object} report - normalized report
 * @param {string} apiBase - origin for API (no trailing slash)
 */
export function buildReportAnalysisPrompt(report, apiBase) {
  const runId = report.runId;
  const base = apiBase.replace(/\/$/, '');
  const reportUrl = `${base}/reports/${runId}`;
  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  const nonPass = (report.findings ?? []).filter((f) => f.status !== 'pass' && f.status !== 'not_applicable');
  nonPass.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      (a.checkId ?? '').localeCompare(b.checkId ?? ''),
  );

  const coverageGaps = (report.coverage?.categories ?? []).filter((c) => c.status !== 'executed');
  const urlPreset = RUN_PRESETS['comprehensive-build-url'];
  const repoPreset = RUN_PRESETS['comprehensive-build-repo'];

  const lines = [
    '# Module Health — single report analysis (Cursor agent)',
    '',
    'Follow the tasks below in order. Ground every claim in the report JSON — do not invent file paths or test results.',
    '',
    '## Report location',
    `- **UI:** ${reportUrl}`,
    `- **API:** \`GET ${base}/api/runs/${runId}\``,
    `- **App:** ${report.appName} (\`${report.appId}\`) · **Environment:** ${report.environment}`,
    '',
    '---',
    '',
    '## Your tasks',
    '',
    '### 1. Load the report',
    `Fetch \`GET ${base}/api/runs/${runId}\` (or use the embedded JSON at the end of this prompt if the API is unreachable).`,
    '',
    '### 2. Explain in plain language',
    '- **Gate** (`ship` | `fix_blockers` | `fix_issues` | `investigate_blocked`) — what it means for release.',
    '- **Execution counts** — `summary.execution` and `summary.counts`: planned vs completed vs blocked vs not executed; clarify that blocked/not_tested are not passes.',
    '- **Build coverage** — `coverage.profileLabel`, `coverage.honestyNote`, and which `coverage.categories` were not executed.',
    '',
    '### 3. Non-pass findings (fix order)',
    'List every finding where `status` is not `pass` or `not_applicable`, ordered: **blocker → high → medium → low → info**, then by checkId.',
    'For each: severity, status, title, checkId, one-line user impact, remediation summary.',
    '',
    '### 4. Blocker / high fix plans + one combined prompt',
    'For each **blocker** and **high** fail:',
    '- Short fix plan (steps, acceptance criteria, which checkId must pass on retest).',
    'At the end, output **one combined Cursor implementation prompt** the user can run in the **target application repository** to address all blocker/high items together.',
    '',
    '### 5. Close coverage gaps (full build gate)',
    'From `coverage.categories` and `toolInventory`, state what **additional Module Health runs** are required for a full build gate.',
    'Recommend explicit config:',
    `- URL preset: appId \`${report.appId}\`, inputMode \`url\`, packs \`${(urlPreset.packs ?? []).join(', ')}\`, levels ${(urlPreset.levels ?? [1, 4]).join(', ')}, targetUrl for this environment`,
    `- Repository preset: appId \`${report.appId}\`, inputMode \`repository\`, packs \`${(repoPreset.packs ?? []).join(', ')}\`, repoRoot on scanner`,
    `- UI links: \`${presetToRunTestQuery(report.appId, 'comprehensive-build-url')}\` and \`${presetToRunTestQuery(report.appId, 'comprehensive-build-repo')}\``,
    'Do not claim repository or security coverage was achieved if this run was URL-only.',
    '',
    '---',
    '',
    '## Output format (required)',
    '',
    '1. **Plain-language summary** (gate, execution, coverage)',
    '2. **Ordered non-pass table** (severity, status, checkId, title, fix hint)',
    '3. **Blocker/high fix plans**',
    '4. **Combined implementation prompt** (single fenced block for Cursor)',
    '5. **Additional runs needed** for full build gate',
    '',
    '---',
    '',
    '## Precomputed executive summary (verify against JSON)',
    '',
    JSON.stringify(exec, null, 2),
    '',
    '## Categories not executed this run',
    '',
  ];

  if (!coverageGaps.length) {
    lines.push('- (All tracked categories executed for this run configuration, or coverage not computed.)');
  } else {
    for (const c of coverageGaps) {
      lines.push(`- **${c.label}:** ${(c.reason ?? '').replace(/\*\*/g, '')}`);
    }
  }

  lines.push('', '## Non-pass finding index (verify against JSON)', '');
  for (const f of nonPass) {
    lines.push(
      `- [${f.severity ?? '?'}] ${f.status} \`${f.checkId}\` — ${f.title}`,
    );
  }

  lines.push('', '## Full report JSON (ground truth)', '', '```json');
  lines.push(JSON.stringify(report, null, 2));
  lines.push('```');

  return lines.join('\n');
}
