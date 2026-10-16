import { classifyFindingOutcome } from './finding-classify.mjs';
import { categoryForCheckId, categoryLabel } from './qa-audit-categories.mjs';

const SEV = { blocker: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Ordered repair plan: application vs environment vs optional coverage.
 * @param {object} report - normalized
 */
export function buildRepairPlan(report) {
  const findings = report.findings ?? [];
  const fails = findings.filter((f) => f.status === 'fail');
  const blocked = findings.filter((f) => f.status === 'blocked');
  const notRun = findings.filter((f) => ['not_tested', 'skip', 'not_started'].includes(f.status));

  const appFails = fails.filter((f) => classifyFindingOutcome(f) === 'app_defect');
  const reviewFails = fails.filter((f) => classifyFindingOutcome(f) === 'review');
  const runnerFails = fails.filter((f) => classifyFindingOutcome(f) === 'runner_failure');

  const envBlocked = blocked.filter((f) => isEnvironmentBlocked(f));
  const appBlocked = blocked.filter((f) => !isEnvironmentBlocked(f));

  const sections = [];

  const applicationSteps = [];
  const blockers = appFails.filter((f) => f.severity === 'blocker' || f.severity === 'high');
  for (const f of sortFails(blockers)) {
    applicationSteps.push(
      step('application', 'required', 'fix_blocker', f, 'Blocks gate or high user impact.'),
    );
  }
  const restApp = appFails.filter((f) => !blockers.includes(f));
  for (const f of sortFails(restApp)) {
    applicationSteps.push(
      step('application', 'required', 'fix_defect', f, 'Open application defect in tested scope.'),
    );
  }
  if (applicationSteps.length) {
    sections.push({ id: 'application', label: 'Fix application (site / product)', steps: applicationSteps });
  }

  const environmentSteps = [];
  for (const f of sortFails(runnerFails)) {
    environmentSteps.push(
      step(
        'environment',
        'required',
        'fix_runner',
        f,
        'Tool or scope issue — fix run configuration or install tools before changing application code.',
      ),
    );
  }
  for (const f of sortFails(envBlocked)) {
    environmentSteps.push(
      step(
        'environment',
        'required',
        'unblock',
        f,
        `Install or enable tool: ${f.title ?? f.checkId}. Not an application code defect.`,
      ),
    );
  }
  for (const f of sortFails(appBlocked)) {
    environmentSteps.push(
      step(
        'environment',
        'required',
        'unblock',
        f,
        `Unblock prerequisite: ${f.blockedBy ?? f.detail ?? 'see report'}.`,
      ),
    );
  }
  if (environmentSteps.length) {
    sections.push({
      id: 'environment',
      label: 'Unblock environment & prerequisites',
      steps: environmentSteps,
    });
  }

  const investigateSteps = [];
  for (const f of sortFails(reviewFails)) {
    investigateSteps.push(
      step(
        'investigate',
        'optional',
        'investigate',
        f,
        'Lower-confidence or scope-limited signal — confirm in app repo before treating as ship blocker.',
      ),
    );
  }
  if (investigateSteps.length) {
    sections.push({ id: 'investigate', label: 'Investigate (optional)', steps: investigateSteps });
  }

  const coverageSteps = [];
  const coverageCandidates = notRun.filter((f) => shouldIncludeCoverageGap(f, report));
  for (const f of coverageCandidates.slice(0, 8)) {
    coverageSteps.push(
      step('coverage', 'optional', 'enable_check', f, 'Expand coverage — not a defect until executed.'),
    );
  }
  if (coverageCandidates.length > 8) {
    coverageSteps.push({
      section: 'coverage',
      order: 0,
      priority: 'optional',
      kind: 'enable_check',
      findingId: null,
      checkId: null,
      categoryId: 'other',
      categoryLabel: categoryLabel('other'),
      title: `${coverageCandidates.length - 8} additional not-executed checks`,
      rationale: 'See coverage section for full list.',
      dependsOn: [],
    });
  }
  if (coverageSteps.length) {
    sections.push({ id: 'coverage', label: 'Optional — expand test coverage', steps: coverageSteps });
  }

  const steps = renumberSteps(sections);

  return {
    sections,
    steps,
    requiredCount: steps.filter((s) => s.priority === 'required').length,
    optionalCount: steps.filter((s) => s.priority === 'optional').length,
    note:
      'Application fixes are separate from installing scanners (ZAP, k6) or running workflow recipes. URL-only marketing scans do not prove logged-in product behavior.',
  };
}

function isEnvironmentBlocked(f) {
  const id = f.checkId ?? '';
  return id.endsWith('.preflight') || ['zap.', 'k6.', 'eslint.', 'semgrep.', 'gitleaks.'].some((p) => id.startsWith(p));
}

function shouldIncludeCoverageGap(f, report) {
  const id = f.checkId ?? '';
  if (id === 'l3.workflows.none') {
    const levels = report.levels ?? report.meta?.runScope?.levels ?? [1];
    if (!levels.includes(3)) return false;
    if (report.appId === 'adhoc-url-scan') return false;
    const packs = report.packsExecuted ?? report.meta?.runScope?.packs ?? [];
    if (!packs.includes('workflow')) return false;
  }
  return true;
}

function sortFails(list) {
  return [...list].sort(
    (a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9) || (a.checkId ?? '').localeCompare(b.checkId ?? ''),
  );
}

function step(section, priority, kind, f, rationale) {
  const cat = categoryForCheckId(f.checkId ?? '');
  return {
    section,
    order: 0,
    priority,
    kind,
    findingId: f.id,
    checkId: f.checkId,
    categoryId: cat,
    categoryLabel: categoryLabel(cat),
    title: f.title,
    severity: f.severity,
    rationale,
    dependsOn: f.blockedBy ? [f.blockedBy] : [],
  };
}

function renumberSteps(sections) {
  let order = 1;
  const flat = [];
  for (const sec of sections) {
    for (const s of sec.steps) {
      flat.push({ ...s, order: order++ });
    }
  }
  return flat;
}
