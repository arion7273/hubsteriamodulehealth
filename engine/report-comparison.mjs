import { compareRunsDetailed } from './run-changes.mjs';

/**
 * Compare Module Health runs by checkId to show progress between scans.
 */

/**
 * @param {object[]} findings
 * @returns {Map<string, object>}
 */
export function indexFindingsByCheckId(findings) {
  const map = new Map();
  for (const f of findings ?? []) {
    const checkId = f.checkId;
    if (!checkId) continue;
    const existing = map.get(checkId);
    if (!existing) {
      map.set(checkId, f);
      continue;
    }
    if (f.status === 'fail' && existing.status !== 'fail') map.set(checkId, f);
  }
  return map;
}

/**
 * @param {object[]} baselineFindings
 * @param {object[]} currentFindings
 */
export function compareReportFindings(baselineFindings, currentFindings) {
  const base = indexFindingsByCheckId(baselineFindings);
  const cur = indexFindingsByCheckId(currentFindings);
  const checkIds = new Set([...base.keys(), ...cur.keys()]);

  const fixed = [];
  const stillFailing = [];
  const newFailures = [];
  const stillPassing = [];
  const other = [];

  for (const checkId of checkIds) {
    const b = base.get(checkId);
    const c = cur.get(checkId);
    const bFail = b?.status === 'fail';
    const cFail = c?.status === 'fail';

    if (bFail && !cFail) {
      fixed.push({ checkId, baseline: summarizeFinding(b), current: summarizeFinding(c) });
    } else if (bFail && cFail) {
      stillFailing.push({ checkId, baseline: summarizeFinding(b), current: summarizeFinding(c) });
    } else if (!bFail && cFail) {
      newFailures.push({ checkId, baseline: b ? summarizeFinding(b) : null, current: summarizeFinding(c) });
    } else if (b && c && !bFail && !cFail) {
      stillPassing.push({ checkId, status: c.status });
    } else {
      other.push({ checkId, baseline: b ? summarizeFinding(b) : null, current: c ? summarizeFinding(c) : null });
    }
  }

  const baselineFailCount = [...base.values()].filter((f) => f.status === 'fail').length;
  const currentFailCount = [...cur.values()].filter((f) => f.status === 'fail').length;

  return {
    fixed,
    stillFailing,
    newFailures,
    stillPassing,
    other,
    counts: {
      baselineFails: baselineFailCount,
      currentFails: currentFailCount,
      fixedCount: fixed.length,
      stillFailingCount: stillFailing.length,
      newFailureCount: newFailures.length,
    },
  };
}

function summarizeFinding(f) {
  if (!f) return null;
  return {
    findingId: f.id,
    checkId: f.checkId,
    status: f.status,
    severity: f.severity,
    title: f.title,
    actual: f.actual ?? null,
    remediationSummary: f.remediation?.summary ?? null,
  };
}

/**
 * Walk previousRunId / retestOf chain to oldest run (raw meta only).
 * @param {string} runId
 * @param {(id: string) => { runId: string, meta?: object } | null} loadMeta
 */
export function findOldestRunInChain(runId, loadMeta) {
  let oldestId = runId;
  let cursor = loadMeta(runId);
  const seen = new Set([runId]);

  while (cursor) {
    const priorId = cursor.meta?.retestOf ?? cursor.meta?.previousRunId;
    if (!priorId || seen.has(priorId)) break;
    seen.add(priorId);
    const prior = loadMeta(priorId);
    if (!prior) break;
    oldestId = priorId;
    cursor = prior;
  }

  return oldestId;
}

/**
 * @param {object} report - normalized
 * @param {(id: string) => object | null} loadNormalizedRun - must not attach comparison (avoid recursion)
 */
export function buildReportComparison(report, loadNormalizedRun) {
  const previousRunId = report.meta?.retestOf ?? report.meta?.previousRunId ?? null;
  if (!previousRunId) return null;

  const previous = loadNormalizedRun(previousRunId);
  if (!previous?.findings) return null;

  const loadMeta = (id) => {
    const r = loadNormalizedRun(id);
    return r ? { runId: r.runId, meta: r.meta } : null;
  };
  const firstRunId = findOldestRunInChain(report.runId, loadMeta);
  const first = firstRunId === report.runId ? null : loadNormalizedRun(firstRunId);

  const vsPrevious = compareReportFindings(previous.findings, report.findings);
  const vsFirst =
    first?.findings?.length
      ? compareReportFindings(first.findings, report.findings)
      : vsPrevious;

  const changesSincePrevious = compareRunsDetailed(previous, report);
  const changesSinceFirst = first ? compareRunsDetailed(first, report) : changesSincePrevious;

  const headline = formatComparisonHeadline(vsFirst, firstRunId, report.runId);

  return {
    previousRunId,
    firstRunId: first ? firstRunId : previousRunId,
    headline,
    vsPrevious,
    vsFirst,
    changesSincePrevious,
    changesSinceFirst,
    notComparable: !changesSincePrevious.comparability.comparable,
    comparabilityIssues: changesSincePrevious.comparability.issues,
  };
}

function formatComparisonHeadline(delta, firstRunId, currentRunId) {
  const { fixedCount, stillFailingCount, newFailureCount, baselineFails, currentFails } = delta.counts;
  if (firstRunId === currentRunId) return null;
  const parts = [];
  if (fixedCount) parts.push(`${fixedCount} check(s) fixed`);
  if (stillFailingCount) parts.push(`${stillFailingCount} still failing`);
  if (newFailureCount) parts.push(`${newFailureCount} new failure(s)`);
  if (!parts.length) {
    return `No check-level changes vs first run \`${firstRunId}\` (${baselineFails} → ${currentFails} fails).`;
  }
  return `${parts.join('; ')} since first run \`${firstRunId}\` (${baselineFails} → ${currentFails} failing checks).`;
}

/**
 * @param {object} report
 * @param {(id: string) => object | null} loadNormalizedRun
 */
export function attachReportComparison(report, loadNormalizedRun) {
  const comparison = buildReportComparison(report, loadNormalizedRun);
  if (!comparison) return report;
  return {
    ...report,
    comparison,
    comparisonNote: comparison.headline
      ? `${comparison.headline} Compare equivalent URL, environment, and packs.`
      : report.comparisonNote,
  };
}
