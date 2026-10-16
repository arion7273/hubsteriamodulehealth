import { fingerprint as fpHash } from './finding-id.mjs';

/**
 * Compare current findings to baseline. Does not mark resolved if baseline missing or scanners failed.
 * @param {import('./types.mjs').CodeHealthFinding[]} current
 * @param {import('./types.mjs').AuditReport | null} baseline
 * @param {import('./types.mjs').ScannerRunResult[]} scanners
 */
export function compareToBaseline(current, baseline, scanners) {
  const anyFailed = scanners.some((s) => s.status === 'failed');
  const scopeNarrowed = baseline && baseline.meta?.scopeLabel && false;

  if (!baseline) {
    return {
      baselinePresent: false,
      newFindings: current,
      resolvedFindings: [],
      unchangedFindings: [],
      notes: ['No baseline file; run health:baseline after reviewing an audit.'],
    };
  }

  if (anyFailed) {
    return {
      baselinePresent: true,
      newFindings: current.filter((f) => f.status === 'open'),
      resolvedFindings: [],
      unchangedFindings: [],
      notes: ['Scanner failure: resolved findings are not inferred (marked unverified in normalize step).'],
    };
  }

  const baseFp = new Map(baseline.findings.map((f) => [f.fingerprint, f]));
  const curFp = new Map(current.map((f) => [f.fingerprint, f]));

  const newFindings = [];
  const resolvedFindings = [];
  const unchangedFindings = [];

  for (const [fingerprint, finding] of curFp) {
    if (!baseFp.has(fingerprint)) {
      newFindings.push(finding);
    } else {
      unchangedFindings.push(finding);
    }
  }

  for (const [fingerprint, finding] of baseFp) {
    if (!curFp.has(fingerprint) && !scopeNarrowed) {
      resolvedFindings.push({ ...finding, status: 'resolved', statusReason: 'Absent in current scan vs baseline' });
    }
  }

  return {
    baselinePresent: true,
    baselineCommit: baseline.meta?.commit,
    baselineScanTime: baseline.meta?.scanTimeIso,
    newFindings,
    resolvedFindings,
    unchangedFindings,
    notes: scopeNarrowed ? ['Scope narrower than baseline; resolved inference skipped.'] : [],
  };
}

/**
 * @param {import('./types.mjs').AuditReport} report
 */
export function buildBaselineFromReport(report) {
  return {
    schemaVersion: report.schemaVersion,
    savedAt: new Date().toISOString(),
    meta: report.meta,
    findingFingerprints: report.findings.map((f) => ({
      fingerprint: f.fingerprint,
      id: f.id,
      category: f.category,
      status: f.status,
    })),
    findings: report.findings,
    scanners: report.scanners.map((s) => ({ id: s.id, status: s.status, version: s.version })),
  };
}

/**
 * @param {import('./types.mjs').CodeHealthFinding[]} findings
 */
export function findingsFingerprintSet(findings) {
  return new Set(findings.map((f) => f.fingerprint || fpHash(JSON.stringify(f))));
}
