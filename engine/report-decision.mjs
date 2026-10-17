import { buildExecutionOutcomeSummary } from './execution-outcomes.mjs';

/** @typedef {'FIX_FIRST' | 'COMPLETE_MISSING_CHECKS' | 'PASSED_TESTED_SCOPE'} ReportRecommendation */

/**
 * Top-of-report decision block tied to evidence (no invented findings).
 * @param {object} report - normalized
 */
export function buildReportDecision(report) {
  const sections = report.structured?.sections ?? {};
  const appFails = [
    ...(sections.app_defects ?? []),
    ...(sections.review ?? []).filter((f) => f.status === 'fail'),
  ];
  const runnerFails = (sections.runner_failures ?? []).filter((f) => f.status === 'fail');
  const blocked = sections.blocked ?? [];
  const notExecuted = sections.not_executed ?? [];
  const counts = report.summary?.counts ?? {};
  const outcomes = buildExecutionOutcomeSummary(report);

  let recommendation = /** @type {ReportRecommendation} */ ('PASSED_TESTED_SCOPE');
  let explanation = '';
  const evidence = [];

  if (appFails.length > 0) {
    recommendation = 'FIX_FIRST';
    const top = appFails.slice(0, 3).map((f) => `${f.title} (\`${f.checkId}\`)`);
    explanation = `${appFails.length} application issue(s) failed in completed checks. Address these before treating the site as healthy for this scope.`;
    evidence.push(...top);
    if (runnerFails.length) {
      evidence.push(
        `${runnerFails.length} scanner/runner failure(s) also present — fix application issues first; runner errors may be environmental.`,
      );
    }
  } else if (runnerFails.length > 0 || blocked.length > 0 || counts.not_tested > 0) {
    recommendation = 'COMPLETE_MISSING_CHECKS';
    const parts = [];
    if (runnerFails.length) {
      parts.push(
        `${runnerFails.length} tool execution failure(s) (e.g. \`${runnerFails[0].checkId}\`) — not proof the application is broken.`,
      );
    }
    if (blocked.length) parts.push(`${blocked.length} blocked check(s) waiting on prerequisites.`);
    if (counts.not_tested > 0) parts.push(`${counts.not_tested} planned check(s) did not run.`);
    explanation = parts.join(' ');
    evidence.push(...runnerFails.slice(0, 2).map((f) => f.actual ?? f.title));
  } else if (counts.fail > 0) {
    recommendation = 'FIX_FIRST';
    explanation = `${counts.fail} failing check(s) in summary — review section B.`;
  } else {
    recommendation = 'PASSED_TESTED_SCOPE';
    explanation =
      'All executed checks in this configuration passed. This does not certify authenticated workflows, database behavior, or full product coverage.';
    if (notExecuted.length || blocked.length) {
      evidence.push(
        `${notExecuted.length + blocked.length} check(s) were blocked or not executed — see coverage section.`,
      );
    }
  }

  const nextActions = buildNextActions(report, recommendation, appFails, runnerFails, blocked, notExecuted);

  return {
    recommendation,
    recommendationLabel: labelFor(recommendation),
    explanation,
    evidenceBullets: evidence.filter(Boolean),
    runContext: buildRunContext(report),
    outcomes,
    nextActions,
    separates: {
      applicationIssues: appFails.length,
      runnerFailures: runnerFails.length,
      setupBlockers: blocked.length,
      notExecuted: notExecuted.length,
    },
  };
}

function labelFor(rec) {
  if (rec === 'FIX_FIRST') return 'Fix first';
  if (rec === 'COMPLETE_MISSING_CHECKS') return 'Complete missing checks';
  return 'Passed tested scope';
}

function buildRunContext(report) {
  const tz = report.timezone ?? 'UTC';
  const when = report.generatedAt ?? report.meta?.endedAt ?? null;
  let whenLabel = when ? new Date(when).toLocaleString('en-US', { timeZone: tz }) : 'Not recorded';
  return {
    appName: report.appName ?? report.appId,
    appId: report.appId,
    targetUrl: report.meta?.targetUrl ?? null,
    finalUrl: report.meta?.finalUrl ?? null,
    environment: report.environment ?? '—',
    inputMode: report.inputMode ?? 'url',
    inputModeLabel: inputModeLabel(report.inputMode),
    runAt: when,
    runAtLabel: whenLabel,
    timezone: tz,
    buildId: report.buildId ?? report.meta?.buildId ?? report.meta?.buildIdentification?.buildId ?? null,
    buildLabel: buildLabel(report),
    packsExecuted: report.packsExecuted ?? [],
    levels: report.levels ?? [1],
    runId: report.runId,
    retestOf: report.meta?.retestOf ?? null,
    previousRunId: report.meta?.previousRunId ?? null,
  };
}

function buildLabel(report) {
  const ident = report.meta?.buildIdentification;
  if (ident?.label) return ident.label;
  const id = report.buildId ?? report.meta?.buildId;
  if (id) return `Build ${id}`;
  if (report.inputMode === 'url' || report.inputMode === 'html') {
    return 'Build not identified (no git checkout, deploy headers, or page build meta on entry URL).';
  }
  return 'Build not identified.';
}

function inputModeLabel(mode) {
  if (mode === 'url') return 'Live URL (public page scan)';
  if (mode === 'html') return 'HTML snapshot';
  if (mode === 'repo') return 'Repository / filesystem';
  return mode ?? 'Unknown';
}

function buildNextActions(report, recommendation, appFails, runnerFails, blocked, notExecuted) {
  const actions = [];
  if (recommendation === 'FIX_FIRST' && appFails[0]) {
    actions.push(
      `Fix highest-severity issue: ${appFails[0].title} — use Cursor repair prompt for finding \`${appFails[0].id}\`.`,
    );
  }
  if (appFails.length > 1) {
    actions.push(`Work through remaining ${appFails.length - 1} application issue(s) in section B (grouped list).`);
  }
  if (runnerFails.length) {
    actions.push(
      `Re-run or fix scanner failures (${runnerFails.map((f) => f.checkId).join(', ')}) — keep browser foreground; confirm URL loads before blaming the app.`,
    );
  }
  if (blocked.length || notExecuted.length) {
    actions.push('Unblock or enable missing checks in section E — configure auth, repo path, or broader presets.');
  }
  if (recommendation === 'PASSED_TESTED_SCOPE') {
    actions.push('Optional: run comprehensive repository preset or authenticated workflows for deeper coverage.');
  }
  actions.push(
    `Retest from this report after deploy; confirm comparison shows verified fixes (linked run${report.meta?.retestOf ? `, retest of \`${report.meta.retestOf}\`` : ''}).`,
  );
  return actions.slice(0, 3);
}
