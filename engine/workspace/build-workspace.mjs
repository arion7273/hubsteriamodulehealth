import { buildFindingCard } from '../finding-card-model.mjs';
import { buildReportDecision } from '../report-decision.mjs';
import { classifyFindingOutcome } from '../finding-classify.mjs';
import { fingerprintRawRun } from './raw-run-fingerprint.mjs';
import { WORKSPACE_SCHEMA_VERSION } from './schema.mjs';

/**
 * Versioned workspace bundle: immutable raw + derived views (no AI mutating pass/fail).
 * @param {object} report - from getRun()
 * @param {object} workspaceState
 */
export function buildWorkspaceBundle(report, workspaceState) {
  const decision = report.reportFirst?.decision ?? buildReportDecision(report);
  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const runnerFails = fails.filter((f) => classifyFindingOutcome(f) === 'runner_failure');
  const appFails = fails.filter((f) => classifyFindingOutcome(f) !== 'runner_failure');
  const blocked = (report.findings ?? []).filter((f) => f.status === 'blocked');
  const notTested = (report.findings ?? []).filter((f) =>
    ['not_tested', 'skip', 'not_started'].includes(f.status),
  );

  const activeRevision = workspaceState.ai.revisions.find(
    (r) => r.id === workspaceState.ai.activeRevisionId,
  );

  const issues = fails.map((f) => {
    const card = buildFindingCard(f, report);
    const note = activeRevision?.analysis?.findingNotes?.find((n) => n.findingId === f.id);
    return {
      findingId: f.id,
      checkId: f.checkId,
      title: f.title,
      severity: f.severity,
      status: f.status,
      moduleId: f.moduleId,
      outcomeKind: card.outcomeKind,
      expected: card.expected,
      actual: card.actual,
      userImpact: card.userImpact,
      reproduction: card.reproduction,
      evidence: f.evidence ?? [],
      cause: card.cause,
      remediation: f.remediation?.summary ?? card.recommendedFix,
      acceptanceCriteria: card.acceptanceCriteria,
      aiNote: note ?? null,
      measuredStatus: f.status,
    };
  });

  issues.sort(
    (a, b) =>
      ({ blocker: 0, high: 1, medium: 2, low: 3 }[a.severity] ?? 9) -
      ({ blocker: 0, high: 1, medium: 2, low: 3 }[b.severity] ?? 9),
  );

  const comparison =
    report.comparison?.changesSincePrevious ??
    report.reportFirst?.changesSincePreviousRun ??
    null;
  const history = buildHistoryView(report, comparison, workspaceState);

  const repoRoot = report.meta?.repoRoot ?? null;
  const repairMode = repoRoot ? 'repository' : report.inputMode === 'url' || report.inputMode === 'html' ? 'url' : 'url';

  return {
    workspaceVersion: WORKSPACE_SCHEMA_VERSION,
    runId: report.runId,
    raw: {
      fingerprint: fingerprintRawRun(report),
      reportSchemaVersion: report.reportSchemaVersion ?? 3,
      gate: report.gate,
      counts: report.summary?.counts ?? {},
      generatedAt: report.generatedAt,
      evidenceIndex: (report.findings ?? [])
        .filter((f) => (f.evidence?.length ?? 0) > 0)
        .map((f) => ({ findingId: f.id, checkId: f.checkId, evidence: f.evidence })),
    },
    overview: {
      decision,
      target: {
        appName: report.appName,
        appId: report.appId,
        environment: report.environment,
        url: report.meta?.targetUrl ?? null,
        inputMode: report.inputMode,
        buildLabel: decision.runContext?.buildLabel,
        packs: report.packsExecuted ?? [],
      },
      problems: issues.slice(0, 8),
      nextActions: decision.nextActions ?? [],
      separates: {
        applicationFailures: appFails.length,
        runnerFailures: runnerFails.length,
        blocked: blocked.length,
        notTested: notTested.length,
      },
      comparisonSummary: comparison
        ? {
            baselineRunId: comparison.baselineRunId,
            counts: comparison.counts,
            notComparable: !comparison.comparability?.comparable,
            issues: comparison.comparability?.issues ?? [],
          }
        : null,
    },
    issues: {
      total: issues.length,
      items: issues,
      groups: groupIssues(issues),
    },
    ai: {
      status: workspaceState.ai.status,
      activeRevision: activeRevision ?? null,
      revisions: workspaceState.ai.revisions.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        cacheKey: r.cacheKey,
        status: r.status,
        model: r.model,
      })),
      lastError: workspaceState.ai.lastError,
      disclaimer:
        'AI interprets evidence only. Pass/fail counts and gate outcomes are measured — AI cannot upgrade a failed check to pass.',
    },
    repair: {
      mode: repairMode,
      repoRoot,
      remoteWorkerAvailable: false,
      items: workspaceState.repairs,
    },
    verification: {
      runs: workspaceState.verificationRuns,
      repairs: workspaceState.repairs.filter((r) => r.verification),
    },
    history,
    legacy: {
      reportFirstAvailable: Boolean(report.reportFirst),
      qaAuditAvailable: Boolean(report.qaAudit),
    },
  };
}

function groupIssues(issues) {
  const map = new Map();
  for (const i of issues) {
    const key = i.moduleId ?? i.outcomeKind ?? 'general';
    if (!map.has(key)) map.set(key, { id: key, label: key, items: [] });
    map.get(key).items.push(i.findingId);
  }
  return [...map.values()];
}

function buildHistoryView(report, comparison, workspaceState) {
  const changes = comparison ?? null;
  return {
    baselineRunId: changes?.baselineRunId ?? report.meta?.previousRunId ?? null,
    verifiedFixed: changes?.verifiedFixed ?? [],
    possiblyFixed: changes?.possiblyFixed ?? [],
    stillFailing: changes?.stillFailing ?? [],
    newFailures: changes?.newFailures ?? [],
    returned: changes?.returned ?? [],
    notRetested: changes?.notRetested ?? [],
    repairOutcomes: workspaceState.repairs.map((r) => ({
      repairId: r.id,
      status: r.status,
      findingIds: r.findingIds,
      verificationRunId: r.verification?.retestRunId ?? null,
    })),
    policyNote: changes?.verificationPolicy?.note ?? null,
  };
}
