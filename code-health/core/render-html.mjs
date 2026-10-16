import fs from 'node:fs/promises';
import { reportSummary } from './normalize-findings.mjs';

/**
 * @param {import('./types.mjs').AuditReport} report
 * @param {string} outPath
 */
export async function renderHtmlReport(report, outPath) {
  const summary = reportSummary(report);
  const scannerRows = report.scanners
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.status)}</td><td>${s.durationMs}ms</td><td>${s.findings.length}</td><td>${escapeHtml(s.error ?? s.skipReason ?? '')}</td></tr>`,
    )
    .join('\n');

  const findingRows = report.findings
    .map((f) => {
      const locs = f.locations.map((l) => `${l.file}${l.line ? `:${l.line}` : ''}`).join('<br>');
      return `<tr>
        <td><code>${escapeHtml(f.id)}</code></td>
        <td>${escapeHtml(f.category)}</td>
        <td>${escapeHtml(f.priority)}</td>
        <td>${escapeHtml(f.status)}</td>
        <td>${locs}</td>
        <td>${escapeHtml(f.summary)}</td>
      </tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>Code Health Audit — ${escapeHtml(report.meta.repository)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.45; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; vertical-align: top; }
    th { background: #f4f4f4; }
    code { font-size: 0.9em; }
    .meta { background: #fafafa; padding: 1rem; border: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>Code Health Audit</h1>
  <div class="meta">
    <p><strong>Repository:</strong> ${escapeHtml(report.meta.repository)}</p>
    <p><strong>Branch:</strong> ${escapeHtml(report.meta.branch)} &nbsp; <strong>Commit:</strong> <code>${escapeHtml(report.meta.commit)}</code></p>
    <p><strong>Dirty working tree:</strong> ${report.meta.dirtyWorkingTree ? 'yes' : 'no'}</p>
    <p><strong>Scan time:</strong> ${escapeHtml(report.meta.scanTimeIso)}</p>
    <p><strong>Scope:</strong> ${escapeHtml(report.meta.scopeLabel)}</p>
    <p><strong>Tools:</strong> jscpd ${escapeHtml(report.meta.toolVersions.jscpd)}, knip ${escapeHtml(report.meta.toolVersions.knip)}, node ${escapeHtml(report.meta.toolVersions.node)}</p>
    <p><strong>Findings:</strong> ${summary.findingCount} &nbsp; <strong>Report ID:</strong> ${escapeHtml(report.reportId)}</p>
  </div>

  <h2>Scanners</h2>
  <table>
    <thead><tr><th>Scanner</th><th>Status</th><th>Duration</th><th>Findings</th><th>Notes</th></tr></thead>
    <tbody>${scannerRows}</tbody>
  </table>

  <h2>Findings (prioritized)</h2>
  <table>
    <thead><tr><th>ID</th><th>Category</th><th>Priority</th><th>Status</th><th>Location</th><th>Summary</th></tr></thead>
    <tbody>${findingRows}</tbody>
  </table>

  <p><em>Structured JSON: see <code>reports/code-health/latest.json</code>. Backlog: <code>CODE_HEALTH_BACKLOG.md</code>.</em></p>
</body>
</html>`;

  await fs.writeFile(outPath, html, 'utf8');
}

/**
 * @param {string} s
 */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
