import { summarizeFindings } from './findings.mjs';

/** Statuses that mean the check actually ran and produced pass/fail. */
export const COMPLETED_STATUSES = new Set(['pass', 'fail']);

/** Statuses that were planned but not executed. */
export const NOT_EXECUTED_STATUSES = new Set(['not_tested', 'not_started', 'skip']);

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

  let line = fail === 0
    ? `All ${pass} completed check(s) passed.`
    : `${fail} check(s) failed; ${pass} passed of ${completed} completed.`;

  if (blocked > 0) line += ` ${blocked} blocked.`;
  if (notExecuted > 0) line += ` ${notExecuted} not executed.`;

  if (modulesConfigured === 0) {
    line += ' Module coverage not configured.';
  } else {
    line += ` ${modulesCovered} of ${modulesConfigured} module(s) referenced in findings.`;
  }
  return line;
}
