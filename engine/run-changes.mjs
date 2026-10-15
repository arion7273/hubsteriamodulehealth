import { findingIdentityKey, indexFindingsByIdentity, isCheckExecuted } from './finding-identity.mjs';
import { assessRunComparability } from './run-comparability.mjs';

function row(f, key) {
  if (!f) return null;
  return {
    identityKey: key,
    findingId: f.id,
    checkId: f.checkId,
    status: f.status,
    severity: f.severity,
    title: f.title,
    actual: f.actual ?? null,
  };
}

/**
 * Deterministic change set between baseline and current run.
 * @param {object} baselineReport
 * @param {object} currentReport
 */
export function compareRunsDetailed(baselineReport, currentReport) {
  const comparability = assessRunComparability(baselineReport, currentReport);
  const ctxBase = { appId: baselineReport.appId, environment: baselineReport.environment };
  const ctxCur = { appId: currentReport.appId, environment: currentReport.environment };
  const base = indexFindingsByIdentity(baselineReport.findings, ctxBase);
  const cur = indexFindingsByIdentity(currentReport.findings, ctxCur);
  const keys = new Set([...base.keys(), ...cur.keys()]);

  const verifiedFixed = [];
  const stillFailing = [];
  const newFailures = [];
  const returned = [];
  const notRetested = [];
  const unchangedPassing = [];

  for (const key of keys) {
    const b = base.get(key);
    const c = cur.get(key);
    const bFail = b?.status === 'fail';
    const cFail = c?.status === 'fail';
    const bExecuted = isCheckExecuted(b);
    const cExecuted = isCheckExecuted(c);

    if (!c && b) {
      notRetested.push({
        ...row(b, key),
        reason: 'Check present on baseline run but absent on current run (not retested).',
      });
      continue;
    }
    if (c && !cExecuted && b) {
      notRetested.push({
        ...row(c, key),
        reason: `Current status is ${c.status} — not a completed pass/fail.`,
      });
      continue;
    }
    if (bFail && cExecuted && !cFail) {
      verifiedFixed.push({ ...row(c, key), previous: row(b, key) });
    } else if (bFail && cFail) {
      stillFailing.push({ current: row(c, key), baseline: row(b, key) });
    } else if (!bFail && cFail) {
      if (b && bExecuted && b.status === 'pass') {
        returned.push({ current: row(c, key), baseline: row(b, key) });
      } else {
        newFailures.push({ current: row(c, key), baseline: b ? row(b, key) : null });
      }
    } else if (b && c && !bFail && !cFail && bExecuted && cExecuted) {
      unchangedPassing.push(row(c, key));
    }
  }

  return {
    comparability,
    baselineRunId: baselineReport.runId,
    currentRunId: currentReport.runId,
    verifiedFixed,
    stillFailing,
    newFailures,
    returned,
    notRetested,
    unchangedPassing,
    counts: {
      verifiedFixed: verifiedFixed.length,
      stillFailing: stillFailing.length,
      newFailures: newFailures.length,
      returned: returned.length,
      notRetested: notRetested.length,
    },
  };
}
