import { buildExecutiveSummary } from './report-executive-summary.mjs';
import { buildReportDecision } from './report-decision.mjs';
import { AUDIT_CATEGORIES, categoryForCheckId, categoryLabel } from './qa-audit-categories.mjs';
import { presetToRunTestQuery, RUN_PRESETS } from './run-presets.mjs';
import { getFixPlaybook } from './fix-playbooks.mjs';
import {
  QAV5_TEMPLATE_ID,
  QAV5_TEMPLATE_LABEL,
  QAV5_REFERENCE_TITLE,
  QAV5_REFERENCE_PDF_PATH,
  QAV5_TABLE_OF_CONTENTS,
  buildTestingGuideChecklist,
  resolveAuditSiteName,
} from './qa-audit-v5-reference.mjs';

const SEV_ORDER = ['blocker', 'high', 'medium', 'low', 'info'];

/**
 * @param {object} report - normalized
 */
function buildQaAuditDocument(report) {
  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  const findings = report.findings ?? [];
  const byCategory = bucketByCategory(findings);
  const severityCounts = countBySeverity(findings.filter((f) => f.status === 'fail'));
  const statusCounts = report.summary?.counts ?? {};
  const tools = report.toolInventory ?? [];
  const coverage = report.coverage;
  const targetUrl = report.meta?.targetUrl ?? report.meta?.finalUrl ?? '—';
  const siteName = resolveAuditSiteName(targetUrl, report.appName, report.appId);
  const limitations = buildLimitations(report, coverage, tools);
  const testingGuide = buildTestingGuideChecklist(findings);
  const pagesTested = targetUrl !== '—' ? [{ url: targetUrl, finalUrl: report.meta?.finalUrl ?? targetUrl }] : [];

  const scorecard = {
    gate: report.gate,
    severityOpen: severityCounts,
    statusCounts,
    toolsExecuted: tools.filter((t) => t.executed).length,
    toolsTotal: tools.length,
    categoriesWithFails: Object.keys(byCategory).filter((k) => byCategory[k].some((f) => f.status === 'fail')),
  };

  const topFixes = exec.items.filter((i) => i.severity === 'blocker' || i.severity === 'high').slice(0, 10);
  if (topFixes.length < 10) {
    topFixes.push(
      ...exec.items
        .filter((i) => i.severity === 'medium')
        .slice(0, 10 - topFixes.length),
    );
  }

  const narrative = buildHealthNarrative(report, siteName, severityCounts, statusCounts, coverage);
  const failureDigests = buildFailureDigests(findings);
  const coverageGaps = buildCoverageGaps(report, findings, coverage, tools);

  return {
    version: 'qa-audit-v5',
    templateId: QAV5_TEMPLATE_ID,
    templateLabel: QAV5_TEMPLATE_LABEL,
    referencePdfPath: QAV5_REFERENCE_PDF_PATH,
    referenceNote:
      'Outline matches HubsteriaBrew QA Audit V5 (Re-test) reference PDF. Automated runs fill health, scorecard, checklist, and categorized findings; logged-in functional depth requires workflow configuration.',
    referencePdfFile: 'qav5.pdf',
    title: `${QAV5_TEMPLATE_LABEL} — ${siteName}`,
    site: siteName,
    appId: report.appId,
    environment: report.environment,
    url: targetUrl,
    testDate: report.generatedAt ?? report.meta?.endedAt,
    runId: report.runId,
    reportSchemaVersion: report.reportSchemaVersion,
    scorecard,
    executiveNarrative: narrative,
    failureDigests,
    coverageGaps,
    topConcerns: topFixes.slice(0, 3).map((t) => ({
      title: t.title,
      severity: t.severity,
      checkId: t.checkId,
      summary: t.remediationSummary,
    })),
    topFixList: topFixes,
    findingsByCategory: byCategory,
    tableOfContents: buildToc(byCategory, limitations),
    qav5Outline: QAV5_TABLE_OF_CONTENTS,
    testingGuideChecklist: testingGuide,
    pagesTested,
    viewportsTested: extractViewports(findings),
    methodology: buildMethodology(report),
    toolsAppendix: tools,
    testingLimitations: limitations,
    recommendedNextRuns: buildNextRuns(report),
    markdown: null,
    html: null,
  };
}

function bucketByCategory(findings) {
  const map = {};
  for (const cat of AUDIT_CATEGORIES) map[cat.id] = [];
  for (const f of findings) {
    const cat = categoryForCheckId(f.checkId ?? '');
    (map[cat] ?? map.other).push(f);
  }
  for (const key of Object.keys(map)) {
    map[key].sort(severitySort);
  }
  return map;
}

function severitySort(a, b) {
  return SEV_ORDER.indexOf(a.severity) - SEV_ORDER.indexOf(b.severity) || (a.checkId ?? '').localeCompare(b.checkId ?? '');
}

function countBySeverity(fails) {
  const c = { blocker: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of fails) {
    const s = f.severity ?? 'medium';
    if (c[s] !== undefined) c[s]++;
  }
  return c;
}

function buildHealthNarrative(report, siteName, severityCounts, statusCounts, coverage) {
  const lines = [];
  const decision = buildReportDecision(report);
  lines.push(
    `**Recommendation:** ${decision.recommendationLabel} — ${decision.explanation}`,
  );
  if (decision.runContext.buildLabel) {
    lines.push(`**Build:** ${decision.runContext.buildLabel}`);
  }
  lines.push(
    `**Target:** ${decision.runContext.targetUrl ?? '—'} · **Mode:** ${decision.runContext.inputModeLabel}`,
  );
  const failN = statusCounts.fail ?? 0;
  const passN = statusCounts.pass ?? 0;
  const blockedN = statusCounts.blocked ?? 0;
  const notTestedN = (statusCounts.not_tested ?? 0) + (statusCounts.skip ?? 0);
  lines.push(
    report.appId === 'adhoc-url-scan' && siteName
      ? `This audit summarizes Module Health run \`${report.runId}\` for **${siteName}** (ad-hoc URL scan, ${report.environment}, input **${report.inputMode ?? 'url'}**).`
      : `This audit summarizes Module Health run \`${report.runId}\` for **${siteName || report.appName}** (${report.environment}, input **${report.inputMode ?? 'url'}**).`,
  );

  if (report.gate === 'ship' && failN === 0) {
    lines.push(
      '**Overall health (in scope):** No failing checks in this run configuration. That does not mean the product is flawless — see coverage gaps and testing limitations below.',
    );
  } else if (report.gate === 'fix_blockers') {
    lines.push(
      `**Overall health:** Release gate **fix_blockers** — address blocker/high issues before treating this build as shippable (${failN} fail(s) in completed checks).`,
    );
  } else if (report.gate === 'fix_issues') {
    lines.push(`**Overall health:** Gate **fix_issues** — ${failN} completed fail(s); no blocker/high class failures in summary.`);
  } else {
    lines.push(`**Overall health:** Gate **${report.gate}**.`);
  }

  lines.push(
    `Completed checks: **${passN} pass**, **${failN} fail**, **${blockedN} blocked**, **${notTestedN} not executed/skipped** (not counted as passes).`,
  );

  if (severityCounts.blocker || severityCounts.high) {
    lines.push(
      `Open severity in fails: ${severityCounts.blocker ?? 0} blocker, ${severityCounts.high ?? 0} high, ${severityCounts.medium ?? 0} medium, ${severityCounts.low ?? 0} low.`,
    );
  }

  if (coverage?.honestyNote) lines.push(coverage.honestyNote);
  if (report.headline) lines.push(report.headline);

  return lines.join('\n\n');
}

function buildFailureDigests(findings) {
  return (findings ?? [])
    .filter((f) => f.status === 'fail')
    .sort(severitySort)
    .map((f) => {
      const pb = getFixPlaybook(f);
      const steps = [...new Set([...(f.remediation?.steps ?? []), ...pb.steps])];
      return {
        checkId: f.checkId,
        title: f.title,
        severity: f.severity,
        suspectedCause: f.suspectedCause ?? null,
        actual: f.actual ?? null,
        remediationSummary: f.remediation?.summary ?? null,
        remediationSteps: steps,
        acceptanceCriteria: pb.acceptanceCriteria,
        likelyFiles: pb.likelyFiles,
        samples: formatFindingSamples(f),
      };
    });
}

function buildCoverageGaps(report, findings, coverage, tools) {
  const notExecuted = (findings ?? []).filter((f) =>
    ['not_tested', 'skip', 'not_started'].includes(f.status),
  );
  const categoriesNotRun = (coverage?.categories ?? []).filter((c) => c.status !== 'executed');
  const toolsNotRun = (tools ?? []).filter((t) => !t.executed);
  return {
    notExecuted,
    categoriesNotRun,
    toolsNotRun,
    comprehensiveNote:
      report.inputMode === 'url'
        ? 'Full tool coverage requires comprehensive URL scan (Playwright, axe, Lighthouse) plus a separate repository run (ESLint, TypeScript, tests, secrets, dependency audit).'
        : 'Pair repository results with a live URL comprehensive preset when shipping customer-facing changes.',
  };
}

function formatFindingSamples(f) {
  const fromEvidence = (f.evidence ?? [])
    .filter((e) => e.value || e.html)
    .map((e) => {
      const sel = e.value ? `\`${e.value}\`` : '';
      const html = e.html ? ` — ${e.html}` : '';
      return `${sel}${html}`.trim();
    });
  if (fromEvidence.length) return fromEvidence.slice(0, 5);
  const actual = f.actual ?? '';
  const eg = actual.includes('e.g.') ? actual.split('e.g.').slice(1).join('e.g.').trim() : null;
  return eg ? [`${eg}`] : [];
}

function buildLimitations(report, coverage, tools) {
  const items = [];
  items.push('Black-box scope: findings reflect what automated tools observed; no source review unless repository packs ran.');
  if (report.inputMode === 'url') {
    items.push('URL-only: no ESLint, TypeScript, unit tests, or secret scans on this run.');
  }
  if (report.inputMode === 'repository') {
    items.push('Repository-only: does not prove live checkout, auth, or production configuration.');
  }
  if (!tools.some((t) => t.executed && /axe|Lighthouse/i.test(t.tool))) {
    items.push('Full accessibility certification not claimed — axe/Lighthouse may not have run.');
  }
  if (coverage?.categories) {
    for (const c of coverage.categories.filter((x) => x.status !== 'executed')) {
      items.push(`Not run: ${c.label} — ${(c.reason ?? '').replace(/\*\*/g, '')}`);
    }
  }
  if (!report.meta?.targetUrl) {
    items.push('Target URL was not recorded on this report (re-run after server update for full metadata).');
  }
  items.push('Authenticated flows require configured test accounts and secrets; not inferred from HTML-only runs.');
  return items;
}

function extractViewports(findings) {
  const vps = new Set();
  for (const f of findings) {
    const m = f.meta?.viewport ?? f.evidence?.find((e) => e.type === 'viewport')?.value;
    if (m) vps.add(String(m));
  }
  if (!vps.size) return ['Desktop (Playwright default)', 'Mobile emulation when Level 4 / ui-a11y pack runs'];
  return [...vps];
}

function buildMethodology(report) {
  return [
    'Black-box automated test from Module Health scan runner.',
    `Input: ${report.inputMode ?? 'url'}; packs: ${(report.packsExecuted ?? []).join(', ') || 'levels ' + (report.levels ?? []).join(', ')}.`,
    'Findings are tool-observed; no source review unless repository packs ran on a checkout.',
  ];
}

function buildNextRuns(report) {
  const appId = report.appId;
  const url = report.meta?.targetUrl;
  if (appId === 'adhoc-url-scan' && url) {
    return [
      {
        label: 'Re-run same URL (QA audit packs)',
        preset: 'any-url-qa-audit',
        query: `/`,
        packs: RUN_PRESETS['any-url-qa-audit'].packs,
        note: `Paste ${url} on the landing page again after fixes.`,
      },
      {
        label: 'Registered app comprehensive URL',
        preset: 'comprehensive-build-url',
        query: presetToRunTestQuery('hubsteria-care', 'comprehensive-build-url'),
        packs: RUN_PRESETS['comprehensive-build-url'].packs,
      },
    ];
  }
  return [
    {
      label: 'Comprehensive URL verification',
      preset: 'comprehensive-build-url',
      query: presetToRunTestQuery(appId, 'comprehensive-build-url'),
      packs: RUN_PRESETS['comprehensive-build-url'].packs,
    },
    {
      label: 'Comprehensive repository verification',
      preset: 'comprehensive-build-repo',
      query: presetToRunTestQuery(appId, 'comprehensive-build-repo'),
      packs: RUN_PRESETS['comprehensive-build-repo'].packs,
    },
  ];
}

function formatFindingCauseCell(f) {
  const parts = [];
  if (f.suspectedCause) parts.push(f.suspectedCause.replace(/\|/g, '/').slice(0, 120));
  const samples = formatFindingSamples(f);
  if (samples.length) parts.push(samples[0].replace(/\|/g, '/').slice(0, 100));
  return parts.join(' · ').slice(0, 160) || (f.detail ?? '').replace(/\|/g, '/').slice(0, 80);
}

function buildToc(byCategory, limitations) {
  const toc = [
    { id: 'executive', label: 'Executive summary' },
    { id: 'scorecard', label: 'Scorecard' },
    { id: 'top-fixes', label: 'Prioritized fix list' },
  ];
  for (const cat of AUDIT_CATEGORIES) {
    if ((byCategory[cat.id] ?? []).length) {
      toc.push({ id: `cat-${cat.id}`, label: categoryLabel(cat.id) });
    }
  }
  toc.push({ id: 'tools', label: 'Tools used' });
  toc.push({ id: 'limitations', label: 'Testing limitations' });
  toc.push({ id: 'next-runs', label: 'Recommended next runs' });
  return toc;
}

/**
 * @param {object} doc - from buildQaAuditDocument before markdown fill
 */
function renderQaAuditMarkdown(report, doc) {
  const lines = [
    `# ${doc.title}`,
    '',
    `> Template: **${doc.templateLabel ?? 'QA Audit V5'}** (\`${doc.templateId ?? 'qav5'}\`)`,
    '',
    '| Field | Value |',
    '|-------|-------|',
    `| Site | ${doc.site} |`,
    `| App ID | \`${doc.appId}\` |`,
    `| URL | ${doc.url} |`,
    `| Environment | ${doc.environment} |`,
    `| Test date | ${doc.testDate ?? '—'} |`,
    `| Run ID | \`${doc.runId}\` |`,
    `| Gate | **${doc.scorecard.gate}** |`,
    '',
    '---',
    '',
    '## Action required — fix these before ship',
    '',
    doc.failureDigests?.length
      ? `**${doc.failureDigests.length} failing check(s)** must pass on re-run. Use Module Health **fix-all prompt** (\`fix-all-prompt.md\` on this run) in Cursor for step-by-step guidance.`
      : '_No failing checks in this scope — see coverage gaps below and run comprehensive presets._',
    '',
  ];

  if (doc.failureDigests?.length) {
    doc.failureDigests.forEach((d, i) => {
      lines.push(`${i + 1}. **[${d.severity}]** \`${d.checkId}\` — ${d.title}`);
      if (d.remediationSummary) lines.push(`   - Fix: ${d.remediationSummary}`);
    });
    lines.push('');
  }

  if (doc.coverageGaps) {
    lines.push('## Coverage gaps (not failures)', '', doc.coverageGaps.comprehensiveNote, '');
    if (doc.coverageGaps.notExecuted?.length) {
      lines.push('### Checks skipped this run', '');
      for (const f of doc.coverageGaps.notExecuted) {
        lines.push(`- \`${f.checkId}\` — ${f.title}: ${f.detail ?? f.actual ?? 'not executed'}`);
      }
      lines.push('');
    }
    if (doc.coverageGaps.toolsNotRun?.length) {
      lines.push(
        `### Tools not used (${doc.coverageGaps.toolsNotRun.length} of ${(doc.toolsAppendix ?? []).length})`,
        '',
      );
      for (const t of doc.coverageGaps.toolsNotRun.slice(0, 12)) {
        lines.push(`- ${t.tool}: ${t.executedReason ?? t.configuredReason ?? 'out of scope'}`);
      }
      lines.push('');
    }
  }

  lines.push('## Executive summary', '', doc.executiveNarrative, '');

  if (doc.topConcerns.length) {
    lines.push('### Top concerns', '');
    doc.topConcerns.forEach((c, i) => {
      lines.push(`${i + 1}. **[${c.severity}]** ${c.title} (\`${c.checkId}\`) — ${c.summary ?? ''}`);
    });
    lines.push('');
  }

  if (doc.failureDigests?.length) {
    lines.push('### What failed and how to fix', '');
    doc.failureDigests.forEach((d, i) => {
      lines.push(`${i + 1}. **[${d.severity}]** \`${d.checkId}\` — ${d.title}`);
      if (d.suspectedCause) lines.push(`   - **Why:** ${d.suspectedCause}`);
      if (d.actual) lines.push(`   - **Observed:** ${d.actual}`);
      if (d.remediationSummary) lines.push(`   - **Fix:** ${d.remediationSummary}`);
      for (const step of d.remediationSteps ?? []) {
        lines.push(`   - ${step}`);
      }
      if (d.likelyFiles?.length) {
        lines.push('   - **Where to look:**');
        for (const file of d.likelyFiles) lines.push(`     - ${file}`);
      }
      if (d.acceptanceCriteria?.length) {
        lines.push('   - **Done when:**');
        for (const ac of d.acceptanceCriteria) lines.push(`     - ${ac}`);
      }
      for (const sample of d.samples ?? []) {
        lines.push(`   - **Sample:** ${sample}`);
      }
      lines.push('');
    });
  }

  lines.push('## Scorecard', '');
  lines.push('| Severity (fails only) | Count |');
  lines.push('|---------------------|------:|');
  for (const s of SEV_ORDER) {
    lines.push(`| ${s} | ${doc.scorecard.severityOpen[s] ?? 0} |`);
  }
  lines.push('');
  lines.push('| Outcome | Count |');
  lines.push('|---------|------:|');
  for (const [k, v] of Object.entries(doc.scorecard.statusCounts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push(`Tools executed: **${doc.scorecard.toolsExecuted}** / ${doc.scorecard.toolsTotal}`, '');

  lines.push('## Testing guide checklist (V5)', '');
  lines.push('| Check | Status |');
  lines.push('|-------|--------|');
  for (const row of doc.testingGuideChecklist ?? []) {
    lines.push(`| ${row.label} | ${row.status} |`);
  }
  lines.push('');

  lines.push('## Findings by category', '');
  for (const cat of AUDIT_CATEGORIES) {
    const items = doc.findingsByCategory[cat.id] ?? [];
    if (!items.length) continue;
    lines.push(`### ${categoryLabel(cat.id)}`, '');
    lines.push('| Status | Sev | Check | Title | Observed | Cause / samples |');
    lines.push('|--------|-----|-------|-------|----------|-----------------|');
    for (const f of items) {
      const actual = (f.actual ?? '').replace(/\|/g, '/').slice(0, 72);
      const cause = formatFindingCauseCell(f);
      lines.push(
        `| ${f.status} | ${f.severity ?? ''} | \`${f.checkId}\` | ${f.title.replace(/\|/g, '/')} | ${actual} | ${cause} |`,
      );
    }
    lines.push('');
  }

  lines.push('## Appendix A — Pages tested', '');
  if (doc.pagesTested?.length) {
    for (const p of doc.pagesTested) lines.push(`- ${p.url}${p.finalUrl && p.finalUrl !== p.url ? ` → ${p.finalUrl}` : ''}`);
  } else lines.push('- (URL not recorded on this run)');
  lines.push('');
  lines.push('## Appendix B — Viewports', '');
  (doc.viewportsTested ?? []).forEach((v) => lines.push(`- ${v}`));
  lines.push('');
  lines.push('## Appendix D — Methodology', '');
  (doc.methodology ?? []).forEach((m) => lines.push(`- ${m}`));
  lines.push('');
  lines.push('## Appendix C — Tools used', '');
  if (!doc.toolsAppendix.length) lines.push('_No tool inventory on this report._');
  else {
    lines.push('| Tool | Executed | Findings | Notes |');
    lines.push('|------|----------|----------|-------|');
    for (const t of doc.toolsAppendix) {
      const note = t.executed ? t.scope ?? '' : t.executedReason ?? t.configuredReason ?? '';
      lines.push(`| ${t.tool} | ${t.executed ? 'yes' : 'no'} | ${t.findingsCount ?? 0} | ${note} |`);
    }
  }
  lines.push('');

  lines.push('## Appendix F — Testing limitations', '');
  doc.testingLimitations.forEach((t) => lines.push(`- ${t}`));
  lines.push('');

  lines.push('## Recommended next runs', '');
  for (const r of doc.recommendedNextRuns) {
    lines.push(`- **${r.label}** — packs: ${r.packs.join(', ')} — UI: \`${r.query}\``);
  }
  lines.push('');
  lines.push('---');
  lines.push('_Generated by Hubsteria Module Health — automated scope; human QA may extend beyond this document._');

  return lines.join('\n');
}

export function attachQaAuditRender(report) {
  const doc = buildQaAuditDocument(report);
  doc.markdown = renderQaAuditMarkdown(report, doc);
  doc.html = renderQaAuditHtml(report, doc);
  return doc;
}

function renderQaAuditHtml(report, doc) {
  const esc = (s) =>
    String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const sevCards = SEV_ORDER.map(
    (s) =>
      `<div class="card"><div class="label">${s}</div><div class="value">${doc.scorecard.severityOpen[s] ?? 0}</div></div>`,
  ).join('');

  let categoryHtml = '';
  for (const cat of AUDIT_CATEGORIES) {
    const items = doc.findingsByCategory[cat.id] ?? [];
    if (!items.length) continue;
    categoryHtml += `<h3 id="cat-${cat.id}">${esc(categoryLabel(cat.id))}</h3><table><thead><tr><th>Status</th><th>Sev</th><th>Check</th><th>Title</th><th>Actual</th></tr></thead><tbody>`;
    for (const f of items) {
      categoryHtml += `<tr><td>${esc(f.status)}</td><td>${esc(f.severity)}</td><td><code>${esc(f.checkId)}</code></td><td>${esc(f.title)}</td><td>${esc(f.actual ?? f.detail)}</td></tr>`;
    }
    categoryHtml += '</tbody></table>';
  }

  const guideRows = (doc.testingGuideChecklist ?? [])
    .map(
      (r) =>
        `<tr><td>${esc(r.label)}</td><td>${esc(r.status)}</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>${esc(doc.title)}</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;color:#111;line-height:1.5}
  .cover{border:2px solid #111;padding:1.5rem;margin-bottom:2rem;text-align:center}
  .cover .kicker{font-size:.75rem;letter-spacing:.15em;text-transform:uppercase;color:#444}
  .cover h1{font-size:1.5rem;margin:.5rem 0}
  h1{font-size:1.75rem} h2{margin-top:2rem;border-bottom:1px solid #ccc}
  .meta table{width:100%;border-collapse:collapse;margin:1rem 0}
  .meta td,.meta th{border:1px solid #ddd;padding:.4rem .6rem;text-align:left}
  .scorecards{display:flex;flex-wrap:wrap;gap:.75rem;margin:1rem 0}
  .card{background:#f4f4f5;border-radius:8px;padding:.75rem 1rem;min-width:5rem}
  .card .label{font-size:.75rem;text-transform:uppercase;color:#555}
  .card .value{font-size:1.5rem;font-weight:700}
  table{width:100%;border-collapse:collapse;font-size:.85rem;margin:1rem 0}
  th,td{border:1px solid #ddd;padding:.35rem .5rem;text-align:left;vertical-align:top}
  th{background:#f9fafb}
  .gate{display:inline-block;padding:.2rem .6rem;border-radius:4px;background:#fef3c7;font-weight:600}
  @media print{body{margin:0;max-width:none}}
</style></head><body>
<div class="cover">
  <div class="kicker">Quality assurance audit</div>
  <h1>${esc(doc.templateLabel ?? 'Website QA Audit Report — V5')}</h1>
  <p><strong>${esc(doc.site)}</strong><br/>${esc(doc.url)}</p>
  <p style="font-size:.85rem;color:#555">Template ${esc(doc.templateId)} · Run ${esc(doc.runId)}</p>
</div>
<p><span class="gate">Gate: ${esc(doc.scorecard.gate)}</span></p>
<div class="meta"><table>
<tr><th>Site</th><td>${esc(doc.site)}</td></tr>
<tr><th>URL</th><td>${esc(doc.url)}</td></tr>
<tr><th>Environment</th><td>${esc(doc.environment)}</td></tr>
<tr><th>Run ID</th><td><code>${esc(doc.runId)}</code></td></tr>
<tr><th>Test date</th><td>${esc(doc.testDate)}</td></tr>
</table></div>
<h2 id="executive">Executive summary</h2>
<p>${esc(doc.executiveNarrative).replace(/\n\n/g, '</p><p>').replace(/\*\*/g, '')}</p>
<h2 id="scorecard">Scorecard</h2>
<p>Open fails by severity:</p>
<div class="scorecards">${sevCards}</div>
<h2 id="testing-guide">Testing guide checklist</h2>
<table><thead><tr><th>Check</th><th>Status</th></tr></thead><tbody>${guideRows}</tbody></table>
<h2 id="top-fixes">Prioritized fix list</h2>
${doc.topFixList.length ? '<ol>' + doc.topFixList.map((t) => `<li><strong>[${esc(t.severity)}]</strong> ${esc(t.title)} <code>${esc(t.checkId)}</code></li>`).join('') + '</ol>' : '<p><em>No fails in scope — see limitations and next runs.</em></p>'}
<h2>Findings by category</h2>
${categoryHtml || '<p><em>No findings recorded.</em></p>'}
<h2 id="tools">Appendix — Tools used</h2>
${doc.toolsAppendix.length ? '<table><thead><tr><th>Tool</th><th>Executed</th><th>Findings</th></tr></thead><tbody>' + doc.toolsAppendix.map((t) => `<tr><td>${esc(t.tool)}</td><td>${t.executed ? 'yes' : 'no'}</td><td>${t.findingsCount ?? 0}</td></tr>`).join('') + '</tbody></table>' : '<p>—</p>'}
<h2 id="limitations">Testing limitations</h2>
<ul>${doc.testingLimitations.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
<h2 id="next-runs">Recommended next runs</h2>
<ul>${doc.recommendedNextRuns.map((r) => `<li>${esc(r.label)} — ${esc(r.packs.join(', '))}</li>`).join('')}</ul>
<p style="margin-top:3rem;color:#666;font-size:.85rem">Hubsteria Module Health — QA audit export (print to PDF from browser)</p>
</body></html>`;
}
