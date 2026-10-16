import { summarizeFindings } from './findings.mjs';

/**
 * Derive execution buckets from the same finding records used for summary counts.
 * @param {object[]} findings
 */
export function deriveExecution(findings) {
  const counts = summarizeFindings(findings);
  const planned = findings.length;
  const completed = counts.pass + counts.fail;
  const blocked = counts.blocked;
  const notExecuted = counts.not_tested + counts.not_started + counts.skip;
  const notApplicable = counts.not_applicable;

  return {
    planned,
    completed,
    blocked,
    notExecuted,
    notApplicable,
    counts,
    /** @deprecated use completed — kept for migration */
    executedLegacy: completed + blocked + notExecuted + notApplicable + counts.skip,
  };
}

export function formatHeadline(execution, modulesConfigured, modulesCovered, options = {}) {
  if (options.runBlocked) return 'Run blocked before execution';
  const { counts, completed, blocked, notExecuted } = execution;
  const fail = counts.fail;
  const pass = counts.pass;

  let line;
  if (fail > 0) {
    line = `${fail} check(s) failed; ${pass} passed of ${completed} completed.`;
  } else if (blocked > 0 || notExecuted > 0) {
    line = `${pass} check(s) passed of ${completed} completed — site not fully tested.`;
  } else {
    line = `All ${pass} completed check(s) passed.`;
  }

  if (blocked > 0) line += ` ${blocked} blocked (prerequisites not met).`;
  if (notExecuted > 0) line += ` ${notExecuted} not executed.`;

  if (modulesConfigured === 0) {
    line += ' Module coverage not configured.';
  } else if (modulesCovered === 0 && options.moduleRoutesNotExercised) {
    line += ` ${modulesConfigured} module(s) in registry; none exercised in this run scope.`;
  } else {
    line += ` ${modulesCovered} of ${modulesConfigured} module(s) referenced in findings.`;
  }
  return line;
}
