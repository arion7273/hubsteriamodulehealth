import { presetToRunTestQuery, RUN_PRESETS } from './run-presets.mjs';
import { buildExecutiveSummary } from './report-executive-summary.mjs';
import { formatPlaybookMarkdown, getFixPlaybook } from './fix-playbooks.mjs';
import { resolveAuditSiteName } from './qa-audit-v5-reference.mjs';

/**
 * Single Cursor prompt: fix every confirmed fail + address documented coverage gaps.
 * @param {object} report - normalized
 * @param {object} [opts]
 * @param {string} [opts.apiBase]
 */
export function buildCursorFixAllGapsPrompt(report, opts = {}) {
  const apiBase = (opts.apiBase ?? 'http://127.0.0.1:4177').replace(/\/$/, '');
  const site = resolveAuditSiteName(report.meta?.targetUrl, report.appName, report.appId);
  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const blocked = (report.findings ?? []).filter((f) => f.status === 'blocked');
  const notExecuted = (report.findings ?? []).filter((f) =>
    ['not_tested', 'skip', 'not_started'].includes(f.status),
  );
  const coverage = report.coverage;
  const tools = report.toolInventory ?? [];
  const toolsRan = tools.filter((t) => t.executed);
  const toolsSkipped = tools.filter((t) => !t.executed);

  const lines = [
    '# Cursor task — fix all Module Health findings & close coverage gaps',
    '',
    'Paste this into **Cursor in the application repository** (not the Module Health repo unless you are changing the scanner).',
    '',
    `**Site:** ${site}`,
    `**URL tested:** ${report.meta?.targetUrl ?? '—'}`,
    `**Module Health run:** \`${report.runId}\``,
    `**Gate:** ${report.gate}`,
    `**Report JSON:** \`${apiBase}/api/runs/${report.runId}/export.json\``,
    '',
  ];

  if (report.comparison?.headline) {
    lines.push('## Progress vs earlier runs', '', report.comparison.headline, '');
  }

  lines.push(
    '## 1. Confirmed defects — you must fix these',
    '',
    fails.length
      ? `**${fails.length} failing check(s)** block a clean gate for this scope.`
      : '_No failing checks in this run — skip to section 2 for coverage gaps._',
    '',
  );

  if (fails.length) {
    fails.forEach((f, i) => {
      lines.push(formatPlaybookMarkdown(f, i + 1), '');
    });
  }

  lines.push(
    '## 2. Coverage gaps — not failures, but limits of this run',
    '',
    'These did **not** fail the build but mean we have **not** proven full product quality. After fixing section 1, run the comprehensive presets below.',
    '',
  );

  if (notExecuted.length) {
    lines.push('### Checks not executed in this run', '');
    for (const f of notExecuted) {
      lines.push(`- \`${f.checkId}\` — ${f.title}: ${f.detail ?? f.actual ?? 'not run'}`);
    }
    lines.push('');
  }

  if (blocked.length) {
    lines.push('### Blocked checks', '');
    for (const f of blocked) {
      lines.push(`- \`${f.checkId}\` — ${f.title}: ${f.actual ?? f.detail ?? ''}`);
    }
    lines.push('');
  }

  if (coverage?.categories?.length) {
    lines.push('### Categories outside this run', '');
    for (const c of coverage.categories.filter((x) => x.status !== 'executed')) {
      lines.push(`- **${c.label}** — ${(c.reason ?? '').replace(/\*\*/g, '')}`);
    }
    lines.push('');
  }

  lines.push('### Tools not run on this scan', '');
  if (!toolsSkipped.length) lines.push('- All configured tools in inventory executed.');
  else {
    for (const t of toolsSkipped) {
      lines.push(`- **${t.tool}** — ${t.executedReason ?? t.configuredReason ?? 'not in scope'}`);
    }
  }
  lines.push('');
  lines.push(
    `**Tools that did run (${toolsRan.length}):** ${toolsRan.map((t) => t.tool).join(', ') || '—'}`,
    '',
  );

  const appId = report.appId;
  const urlPreset = RUN_PRESETS['comprehensive-build-url'];
  const repoPreset = RUN_PRESETS['comprehensive-build-repo'];

  lines.push(
    '## 3. Re-verify with comprehensive Module Health (all tools we support)',
    '',
    'URL-only scans use **Playwright, axe, Lighthouse** (quick-health + ui-a11y). Full “all tools” verification requires **both**:',
    '',
    `1. **Live URL (all browser tools):** preset \`${urlPreset.id}\` — packs: ${urlPreset.packs.join(', ')}`,
    `   - Module Health UI: \`${presetToRunTestQuery(appId, 'comprehensive-build-url')}\``,
    `   - Same URL: ${report.meta?.targetUrl ?? '(re-enter on landing)'}`,
    '',
    `2. **Repository (lint, types, tests, secrets, deps):** preset \`${repoPreset.id}\` — packs: ${repoPreset.packs.join(', ')}`,
    `   - Module Health UI: \`${presetToRunTestQuery(appId, 'comprehensive-build-repo')}\``,
    '   - Requires repository checkout path on the runner.',
    '',
    'After each fix batch: deploy → re-run URL scan → confirm each `checkId` in section 1 is **pass**.',
    '',
  );

  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  lines.push(
    '## 4. Your instructions (Cursor agent)',
    '',
    '1. Work **in priority order**: blocker → high → medium fails from section 1.',
    '2. For each item, implement the **How to fix** steps; use **Evidence samples** to find the right components/CSS.',
    '3. Do **not** claim backend, auth, or API fixes unless this report included repository scans or you have repo evidence.',
    '4. When section 1 is done, list any remaining **coverage gaps** from section 2 and whether they need code changes or only another Module Health run.',
    '5. Output a short **changelog** mapping each `checkId` to files touched.',
    '',
    '### Acceptance checklist',
    '',
  );

  for (const f of fails) {
    const pb = getFixPlaybook(f);
    lines.push(`- [ ] \`${pb.verifyCheckId}\` — ${f.title}`);
  }
  if (!fails.length) lines.push('- [ ] No fails — proceed with comprehensive presets in section 3.');

  lines.push(
    '',
    '### Executive summary (from report)',
    '',
    report.headline ?? '',
    '',
  );

  if (exec.items.length) {
    lines.push('Open issues:', '');
    for (const item of exec.items) {
      lines.push(`- [${item.severity}] ${item.title} (\`${item.checkId}\`)`);
    }
  }

  return lines.join('\n');
}
