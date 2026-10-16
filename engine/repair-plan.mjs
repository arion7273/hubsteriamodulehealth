import { classifyFindingOutcome } from './finding-classify.mjs';

const SEV = { blocker: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * Ordered repair plan: required vs optional, with dependencies.
 * @param {object} report - normalized
 */
export function buildRepairPlan(report) {
  const findings = report.findings ?? [];
  const fails = findings.filter((f) => f.status === 'fail');
  const blocked = findings.filter((f) => f.status === 'blocked');
  const notRun = findings.filter((f) => ['not_tested', 'skip', 'not_started'].includes(f.status));

  const steps = [];
  let order = 1;

  const appFails = fails.filter((f) => classifyFindingOutcome(f) !== 'runner_failure');
  const runnerFails = fails.filter((f) => classifyFindingOutcome(f) === 'runner_failure');

  const blockers = appFails.filter((f) => f.severity === 'blocker' || f.severity === 'high');
  for (const f of sortFails(blockers)) {
    steps.push(step(order++, 'required', 'fix_blocker', f, 'Blocks gate or high user impact.'));
  }

  const restApp = appFails.filter((f) => !blockers.includes(f));
  for (const f of sortFails(restApp)) {
    steps.push(step(order++, 'required', 'fix_defect', f, 'Open application defect in tested scope.'));
  }

  for (const f of sortFails(runnerFails)) {
    steps.push(
      step(
        order++,
        'required',
        'fix_runner',
        f,
        'Tool execution failed — verify environment before changing application code.',
      ),
    );
  }

  for (const f of blocked) {
    steps.push(
      step(order++, 'required', 'unblock', f, `Unblock prerequisite: ${f.blockedBy ?? f.detail ?? 'see report'}.`),
    );
  }

  for (const f of notRun.slice(0, 8)) {
    steps.push(step(order++, 'optional', 'enable_check', f, 'Expand coverage — not a defect until executed.'));
  }
  if (notRun.length > 8) {
    steps.push({
      order: order++,
      priority: 'optional',
      kind: 'enable_check',
      findingId: null,
      checkId: null,
      title: `${notRun.length - 8} additional not-executed checks`,
      rationale: 'See coverage section for full list.',
      dependsOn: [],
    });
  }

  return {
    steps,
    requiredCount: steps.filter((s) => s.priority === 'required').length,
    optionalCount: steps.filter((s) => s.priority === 'optional').length,
    note:
      'Follow order top-to-bottom. Runner failures should not be treated as confirmed application bugs without re-run evidence.',
  };
}

function sortFails(list) {
  return [...list].sort(
    (a, b) => (SEV[a.severity] ?? 9) - (SEV[b.severity] ?? 9) || (a.checkId ?? '').localeCompare(b.checkId ?? ''),
  );
}

function step(order, priority, kind, f, rationale) {
  return {
    order,
    priority,
    kind,
    findingId: f.id,
    checkId: f.checkId,
    title: f.title,
    severity: f.severity,
    rationale,
    dependsOn: f.blockedBy ? [f.blockedBy] : [],
  };
}
