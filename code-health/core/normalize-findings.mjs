import { fingerprint, stableFindingId } from './finding-id.mjs';

/**
 * Merge scanner outputs; dedupe by fingerprint; assign stable ids.
 * @param {import('./types.mjs').ScannerRunResult[]} scanners
 * @param {Map<string, import('./types.mjs').CodeHealthFinding>} [previousByFingerprint]
 */
export function normalizeFindings(scanners, previousByFingerprint = new Map()) {
  const byFp = new Map();
  const scannerFailed = scanners.some((s) => s.status === 'failed');

  for (const scan of scanners) {
    for (const finding of scan.findings) {
      const fp = finding.fingerprint || fingerprint(JSON.stringify([finding.scanner, finding.summary, finding.locations]));
      const prior = previousByFingerprint.get(fp);
      const merged = {
        ...finding,
        fingerprint: fp,
        id: finding.id || stableFindingId(categoryPrefix(finding.category), fp),
        status: resolveStatus(finding, prior, scan.status, scannerFailed),
        statusReason: prior?.statusReason ?? finding.statusReason,
      };
      byFp.set(fp, merged);
    }
  }

  return [...byFp.values()].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

/**
 * @param {import('./types.mjs').FindingCategory} category
 */
function categoryPrefix(category) {
  const map = {
    duplication: 'DUP',
    'unused-code': 'UNUSED',
    'unused-dependency': 'DEPS',
    lint: 'LINT',
    typescript: 'TS',
    'asset-bloat': 'ASSET',
    'bundle-bloat': 'BUNDLE',
    maintenance: 'MAINT',
  };
  return map[category] ?? 'GEN';
}

/**
 * @param {import('./types.mjs').FindingPriority} p
 */
function priorityRank(p) {
  return { critical: 0, high: 1, medium: 2, low: 3 }[p] ?? 4;
}

/**
 * @param {import('./types.mjs').CodeHealthFinding} finding
 * @param {import('./types.mjs').CodeHealthFinding} [prior]
 * @param {import('./types.mjs').ScannerRunStatus} scannerStatus
 * @param {boolean} anyScannerFailed
 */
function resolveStatus(finding, prior, scannerStatus, anyScannerFailed) {
  if (prior?.status === 'accepted' || prior?.status === 'resolved') {
    if (scannerStatus === 'failed') {
      return 'unverified';
    }
    return prior.status;
  }
  if (scannerStatus === 'failed' || scannerStatus === 'unavailable') {
    return 'unverified';
  }
  if (anyScannerFailed && finding.status === 'resolved') {
    return 'unverified';
  }
  return finding.status ?? 'open';
}

/**
 * @param {import('./types.mjs').AuditReport} report
 */
export function reportSummary(report) {
  const byCategory = {};
  const byStatus = {};
  for (const f of report.findings) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
    byStatus[f.status] = (byStatus[f.status] ?? 0) + 1;
  }
  return {
    findingCount: report.findings.length,
    byCategory,
    byStatus,
    scanners: report.scanners.map((s) => ({ id: s.id, status: s.status, findings: s.findings.length })),
  };
}
