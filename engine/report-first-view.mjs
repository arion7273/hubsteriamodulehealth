import { buildExecutiveSummary } from './report-executive-summary.mjs';
import { buildFindingCard } from './finding-card-model.mjs';
import { categoryForCheckId, categoryLabel, AUDIT_CATEGORIES } from './qa-audit-categories.mjs';
import { buildCapabilityModes } from './capability-modes.mjs';
import { buildReportDecision } from './report-decision.mjs';
import { buildRepairPlan } from './repair-plan.mjs';
import { buildFailureGroups } from './finding-groups.mjs';
import { buildCoverageGapsDetail } from './coverage-gaps-detail.mjs';
import { getAiGatewayConfig } from './ai-config.mjs';
import { mergeAiIntoReportFirst } from './ai-report-analysis.mjs';
/**
 * Report-first view model (sections A–F).
 * @param {object} report - normalized, with comparison when available
 */
export function buildReportFirstView(report) {
  const exec = report.executiveSummary ?? buildExecutiveSummary(report);
  const counts = report.summary?.counts ?? {};
  const execution = report.summary?.execution ?? {};
  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const blocked = (report.findings ?? []).filter((f) => f.status === 'blocked');
  const applicationCards = [];
  const executionCards = [];
  for (const f of fails) {
    const card = buildFindingCard(f, report);
    if (card.outcomeKind === 'runner_failure') executionCards.push(card);
    else applicationCards.push(card);
  }
  const cards = [...applicationCards, ...executionCards];
  const decision = buildReportDecision(report);
  const repairPlan = buildRepairPlan(report);
  const failureGroups = buildFailureGroups(report);

  const changes = report.comparison?.changesSincePrevious ?? null;
  const changesFirst = report.comparison?.changesSinceFirst ?? changes;

  const view = {
    version: 2,
    runId: report.runId,
    gate: report.gate,
    decision,
    repairPlan,
    failureGroups,
    actionSummary: buildActionSummary(report, exec, fails, blocked, counts, execution, decision),
    fixTheseFirst: {
      defaultFilter: { status: 'fail' },
      cards,
      applicationCards,
      executionCards,
      filtersAvailable: ['severity', 'status', 'moduleId', 'checkId', 'tool'],
    },
    changesSincePreviousRun: formatChangesSection(report, changes),
    changesSinceFirstRun: formatChangesSection(report, changesFirst, 'first'),
    moduleWorkflowResults: buildModuleResults(report),
    coverageAndLimitations: buildCoverageSection(report),
    technicalEvidence: buildEvidenceIndex(report),
    capabilityModes: buildCapabilityModes(report),
    scorecard: {
      secondary: true,
      gate: report.gate,
      counts,
      execution,
      note: 'Skipped, blocked, and not_tested checks are not passes.',
    },
    comparableBaselines: report.comparableBaselines ?? null,
  };

  const cfg = getAiGatewayConfig();
  return mergeAiIntoReportFirst(view, null, cfg);
}

function buildActionSummary(report, exec, fails, blocked, counts, execution, decision) {
  const workflowsBlocked = blocked.map((f) => ({
    checkId: f.checkId,
    title: f.title,
    blockedBy: f.blockedBy ?? f.detail,
  }));
  const limitedScope = counts.pass > 0 && (counts.not_tested + counts.blocked > 0 || report.inputMode === 'url');
  return {
    headline: report.headline,
    gate: report.gate,
    recommendation: decision.recommendation,
    recommendationLabel: decision.recommendationLabel,
    highestPriorityIssues: exec.items.slice(0, 8).map((i) => ({
      findingId: i.findingId,
      checkId: i.checkId,
      severity: i.severity,
      title: i.title,
      remediationSummary: i.remediationSummary,
    })),
    workflowsBlocked,
    recommendedNextActions: decision.nextActions,
    runCompletion: {
      planned: execution.planned ?? null,
      completed: execution.completed ?? counts.pass + counts.fail,
      blocked: execution.blocked ?? counts.blocked,
      notExecuted: execution.notExecuted ?? counts.not_tested + counts.skip,
      honestHealthNote: limitedScope
        ? 'Passes only reflect checks that ran in this configuration — not whole-product health.'
        : null,
    },
    coverageLimitations: report.coverage?.honestyNote ?? report.summary?.moduleCoverageNote ?? null,
  };
}

function formatChangesSection(report, changes, label = 'previous') {
  if (!changes) {
    return {
      available: false,
      message: 'No comparable prior run linked. Run again on the same URL and packs to enable comparison.',
      baselineRunId: null,
    };
  }
  return {
    available: true,
    label,
    baselineRunId: changes.baselineRunId,
    currentRunId: changes.currentRunId,
    notComparable: !changes.comparability.comparable,
    comparabilityIssues: changes.comparability.issues,
    verifiedFixed: changes.verifiedFixed,
    possiblyFixed: changes.possiblyFixed ?? [],
    stillFailing: changes.stillFailing,
    newFailures: changes.newFailures,
    returned: changes.returned,
    notRetested: changes.notRetested,
    counts: changes.counts,
    verificationPolicy: changes.verificationPolicy ?? null,
  };
}

function buildModuleResults(report) {
  const byCat = {};
  for (const cat of AUDIT_CATEGORIES) byCat[cat.id] = { id: cat.id, label: categoryLabel(cat.id), findings: [] };
  for (const f of report.findings ?? []) {
    const id = categoryForCheckId(f.checkId ?? '');
    if (!byCat[id]) byCat[id] = { id, label: categoryLabel(id), findings: [] };
    byCat[id].findings.push({
      checkId: f.checkId,
      status: f.status,
      title: f.title,
      severity: f.severity,
      note: workflowNote(f),
    });
  }
  return Object.values(byCat).filter((c) => c.findings?.length);
}

function workflowNote(f) {
  if (f.checkId?.startsWith('l1.readiness')) {
    return f.status === 'pass'
      ? 'Page rendered with visible content — does not prove authenticated workflows.'
      : 'Readiness failed — downstream checks may be unreliable.';
  }
  if (f.status === 'pass' && f.checkId?.startsWith('l1.')) {
    return 'Live URL check passed for observed window.';
  }
  return null;
}

function buildCoverageSection(report) {
  const counts = report.summary?.counts ?? {};
  const tools = report.toolInventory ?? [];
  const gapDetail = buildCoverageGapsDetail(report);
  return {
    outcomes: counts,
    categories: report.coverage?.categories ?? [],
    toolsExecuted: tools.filter((t) => t.executed),
    toolsUnavailable: tools.filter((t) => !t.executed),
    limitations: report.qaAudit?.testingLimitations ?? [],
    gaps: gapDetail.gaps,
    gapsTotal: gapDetail.total,
    honestyNote: report.coverage?.honestyNote ?? gapDetail.honestyNote,
  };
}

function buildEvidenceIndex(report) {
  return (report.findings ?? [])
    .filter((f) => (f.evidence?.length ?? 0) > 0 || f.status === 'fail')
    .map((f) => ({
      findingId: f.id,
      checkId: f.checkId,
      status: f.status,
      evidence: f.evidence ?? [],
      artifactDir: report.meta?.artifactDir ?? null,
    }));
}
