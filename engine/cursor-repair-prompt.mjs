import { buildFindingCard } from './finding-card-model.mjs';
import { buildCursorFixPrompt } from './findings.mjs';
import { buildCapabilityModes } from './capability-modes.mjs';
import { getFixPlaybook } from './fix-playbooks.mjs';

export const REPAIR_PROMPT_MAX_ISSUES = 10;

/**
 * Deterministic repair prompt (no AI required).
 * @param {object} report
 * @param {object} opts
 * @param {string[]} [opts.findingIds] - empty = all open fails
 * @param {string} [opts.label]
 */
export function buildCursorRepairPrompt(report, opts = {}) {
  const openFails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const idSet = opts.findingIds?.length ? new Set(opts.findingIds) : null;
  let selected = idSet ? openFails.filter((f) => idSet.has(f.id)) : openFails;
  const maxIssues = opts.maxIssues ?? (idSet ? selected.length : REPAIR_PROMPT_MAX_ISSUES);
  let batchNote = null;
  if (!idSet && selected.length > maxIssues) {
    batchNote = `Batch limited to ${maxIssues} of ${openFails.length} open issues. Use **selected issues** prompts for additional batches — do not rewrite the whole application in one pass.`;
    selected = selected.slice(0, maxIssues);
  }

  if (!selected.length) {
    return `# Module Health repair prompt\n\nNo open failures selected (run ${report.runId}).\n`;
  }

  const modes = buildCapabilityModes(report).filter((m) => m.active).map((m) => m.label);
  const lines = [
    '# Cursor repair prompt — Module Health',
    '',
    `**Application:** ${report.appName} (\`${report.appId}\`)`,
    `**Report / run ID:** \`${report.runId}\``,
    `**Environment:** ${report.environment}`,
    `**URL tested:** ${report.meta?.targetUrl ?? 'Not available'}`,
    `**Repository path:** ${report.meta?.repoRoot ?? 'Not available (URL/HTML scope)'}`,
    `**Included findings:** ${selected.length} — IDs: ${selected.map((f) => f.id).join(', ')}`,
    `**Evidence modes:** ${modes.join('; ') || 'See report'}`,
    '',
    '## Scope',
    '',
    opts.label ?? (idSet ? 'Selected open issues' : 'All open issues'),
    '',
    '## Instructions for the Cursor agent',
    '',
    '1. Read repository instructions (README, AGENTS.md) before editing.',
    '2. Confirm each issue against the **current** codebase — do not assume paths from URL-only scans.',
    '3. Fix **root causes** where confirmed; treat scanner output as **suspected** until verified in code.',
    '4. Preserve unrelated behavior and the established design language.',
    '5. After changes, run appropriate local checks and specify how to re-verify in Module Health.',
    '6. Report changed files, verification evidence, and any unresolved blockers.',
    '7. **Do not** claim completion because code changed — only because listed checks would pass on re-run.',
    '',
  ];
  if (batchNote) {
    lines.push(`> ${batchNote}`, '');
  }
  lines.push('---', '');

  selected.forEach((f, idx) => {
    const card = buildFindingCard(f, report);
    const pb = getFixPlaybook(f);
    lines.push(`## Issue ${idx + 1}: ${f.title}`, '');
    lines.push(`- **Finding ID:** \`${f.id}\``);
    lines.push(`- **Check ID:** \`${f.checkId}\``);
    lines.push(`- **Severity:** ${card.severity} — ${card.severityRationale}`);
    lines.push(`- **Module / workflow:** ${card.workflowCategory}`);
    lines.push(`- **Page:** ${card.page}`);
    lines.push(`- **User impact:** ${card.userImpact}`);
    lines.push('');
    lines.push('### Reproduction');
    card.reproduction.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
    lines.push('');
    lines.push('### Expected vs actual');
    lines.push(`- **Expected:** ${card.expected}`);
    lines.push(`- **Actual:** ${card.actual}`);
    lines.push('');
    lines.push(`### ${card.cause.label} (${card.cause.tier})`);
    lines.push(card.cause.text);
    if (card.requiresSourceInspection) {
      lines.push('', '_Source inspection required — do not invent file paths from URL-only evidence._');
    }
    lines.push('');
    lines.push('### Recommended fix');
    lines.push(card.recommendedFix);
    pb.steps.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
    lines.push('### Acceptance criteria');
    card.acceptanceCriteria.forEach((s) => lines.push(`- ${s}`));
    lines.push('');
    lines.push('### Verification checks');
    card.verificationChecks.forEach((c) => lines.push(`- Module Health must pass: \`${c}\``));
    lines.push('');
    if (card.evidence.length) {
      lines.push('### Evidence');
      lines.push('```json');
      lines.push(JSON.stringify(card.evidence, null, 2));
      lines.push('```');
      lines.push('');
    }
    lines.push('### Single-issue prompt (appendix)');
    lines.push(buildCursorFixPrompt(f));
    lines.push('', '---', '');
  });

  if (report.comparison?.changesSincePrevious) {
    const ch = report.comparison.changesSincePrevious;
    lines.push('## Changes vs previous run', '');
    lines.push(`Baseline: \`${ch.baselineRunId}\``);
    lines.push(
      `Verified fixed: ${ch.counts.verifiedFixed}, still failing: ${ch.counts.stillFailing}, new: ${ch.counts.newFailures}, returned: ${ch.counts.returned}, not retested: ${ch.counts.notRetested}`,
    );
    lines.push('');
  }

  return lines.join('\n');
}
