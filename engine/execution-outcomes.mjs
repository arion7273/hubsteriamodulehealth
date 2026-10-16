/**
 * Plain-language definitions for run outcome counts (not application health %).
 */
export const EXECUTION_OUTCOME_DEFINITIONS = [
  {
    id: 'pass',
    label: 'Pass',
    definition: 'Check completed and met expectations for this run configuration.',
  },
  {
    id: 'fail',
    label: 'Fail',
    definition: 'Check completed and did not meet expectations (application defect or tool-reported issue).',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    definition: 'Prerequisite not met — check did not run; not evidence the app passed.',
  },
  {
    id: 'not_tested',
    label: 'Not tested',
    definition: 'Planned but not executed in this run — scope gap, not a pass.',
  },
  {
    id: 'skip',
    label: 'Skipped',
    definition: 'Intentionally skipped by configuration — does not prove behavior.',
  },
  {
    id: 'execution_error',
    label: 'Execution error',
    definition: 'Scanner or runner failed — investigate tooling before blaming the application.',
  },
];

/**
 * @param {object} report - normalized
 */
export function buildExecutionOutcomeSummary(report) {
  const counts = report.summary?.counts ?? {};
  const exec = report.summary?.execution ?? {};
  const sections = report.structured?.sections ?? {};
  const runnerFails = (sections.runner_failures ?? []).filter((f) => f.status === 'fail').length;
  const appFails =
    (sections.app_defects ?? []).length +
    (sections.review ?? []).filter((f) => f.status === 'fail').length;

  return {
    definitions: EXECUTION_OUTCOME_DEFINITIONS,
    counts,
    execution: exec,
    applicationFailCount: appFails,
    runnerFailCount: runnerFails,
    completionNote:
      'Completed checks = pass + fail only. Blocked and not tested are not passes and are not included in completion rate as health.',
    completionRate:
      exec.planned > 0 ? Math.round((exec.completed / exec.planned) * 100) : null,
    completionRateLabel: 'Check completion (execution only)',
  };
}
