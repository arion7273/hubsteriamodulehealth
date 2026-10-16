import { getFixPlaybook } from './fix-playbooks.mjs';
import { categoryForCheckId, categoryLabel } from './qa-audit-categories.mjs';
import { classifyFindingOutcome } from './finding-classify.mjs';

const NA = 'Not available for this report';

/**
 * @param {object} f - finding
 * @param {object} report - normalized report
 */
export function buildFindingCard(f, report) {
  const pb = getFixPlaybook(f);
  const cat = categoryForCheckId(f.checkId ?? '');
  const requiresSourceInspection =
    (report.inputMode === 'url' || report.inputMode === 'html') && !report.meta?.repoRoot;
  const outcomeKind = classifyFindingOutcome(f);
  const cause = resolveCause(f, { requiresSourceInspection, outcomeKind });

  return {
    findingId: f.id,
    dedupeKey: f.dedupeKey ?? null,
    checkId: f.checkId,
    title: f.title,
    status: f.status,
    severity: f.severity ?? 'medium',
    severityRationale: severityRationale(f),
    moduleId: f.moduleId ?? NA,
    moduleLabel: f.moduleId ?? NA,
    workflowCategory: categoryLabel(cat),
    workflowCategoryId: cat,
    page: f.route ?? report.meta?.targetUrl ?? NA,
    role: f.role ?? NA,
    browserDevice: f.meta?.viewport ?? NA,
    environment: f.environment ?? report.environment ?? NA,
    userImpact: f.userImpact ?? inferImpact(f),
    reproduction: f.reproduction?.length ? f.reproduction : defaultReproduction(report, f),
    expected: f.expected ?? NA,
    actual: f.actual ?? f.detail ?? NA,
    plainLanguageFailure: plainFailureSummary(f),
    evidence: f.evidence ?? [],
    outcomeKind,
    requiresSourceInspection,
    cause,
    verifyRepair: {
      checks: [f.checkId].filter(Boolean),
      note: 'Re-run Module Health on the same URL and packs after deploy; compare runs for verified fixed.',
    },
    recommendedFix: f.remediation?.summary ?? pb.steps[0] ?? NA,
    fixSteps: pb.steps,
    acceptanceCriteria: pb.acceptanceCriteria,
    verificationChecks: [f.checkId].filter(Boolean),
    repairEffort: 'Not estimated',
    firstSeen: f.firstSeen ?? NA,
    lastSeen: f.lastSeen ?? NA,
    occurrences: f.occurrences ?? 1,
    sourceTool: f.meta?.tool ?? toolFromCheckId(f.checkId),
    sourceRule: f.checkId,
    scannerFinding: Boolean(f.scannerFinding),
    unstable: Boolean(f.unstable),
  };
}

function severityRationale(f) {
  if (f.severity === 'blocker') return 'Blocks release gate or critical path.';
  if (f.severity === 'high') return 'Serious user-facing or compliance risk in scope.';
  if (f.severity === 'medium') return 'Should fix before treating build as shippable.';
  if (f.severity === 'low') return 'Minor issue; fix when convenient.';
  return 'Informational.';
}

function inferImpact(f) {
  if (f.checkId?.startsWith('axe.')) return 'Accessibility barriers for users (screen readers, contrast, keyboard).';
  if (f.checkId?.startsWith('l1.readiness')) return 'Page may not render usable content for visitors.';
  if (f.checkId?.startsWith('lighthouse.')) return 'Performance or quality regression for real users.';
  return NA;
}

function defaultReproduction(report, f) {
  const url = report.meta?.targetUrl;
  if (url) {
    return [`Open ${url}`, `Run Module Health check ${f.checkId} (run ${report.runId})`];
  }
  return [`Re-run check ${f.checkId} in Module Health with the same scope as run ${report.runId}.`];
}

function toolFromCheckId(checkId = '') {
  if (checkId.startsWith('axe.')) return 'axe-core';
  if (checkId.startsWith('lighthouse.')) return 'Lighthouse';
  if (checkId.startsWith('eslint.')) return 'ESLint';
  if (checkId.startsWith('l1.')) return 'Playwright';
  return NA;
}

function plainFailureSummary(f) {
  if (f.title && f.actual) return `${f.title}: ${f.actual}`;
  return f.title ?? f.actual ?? NA;
}

function resolveCause(f, { requiresSourceInspection, outcomeKind }) {
  if (outcomeKind === 'runner_failure') {
    return {
      tier: 'confirmed',
      label: 'Confirmed cause',
      text: 'Scanner or runner did not complete successfully for this check.',
      requiresSourceInspection: false,
    };
  }
  if (f.suspectedCause) {
    return {
      tier: 'suspected',
      label: 'Suspected cause',
      text: f.suspectedCause,
      requiresSourceInspection,
    };
  }
  return {
    tier: 'unknown',
    label: 'Cause unknown',
    text: requiresSourceInspection
      ? 'URL-only scan — inspect source in the application repository to confirm root cause.'
      : 'Not determined from recorded evidence.',
    requiresSourceInspection,
  };
}
