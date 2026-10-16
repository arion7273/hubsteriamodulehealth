import crypto from 'node:crypto';

/**
 * Immutable fingerprint of measured outcomes (not AI text).
 * @param {object} report
 */
export function fingerprintRawRun(report) {
  const fails = (report.findings ?? [])
    .map((f) => `${f.id}|${f.checkId}|${f.status}|${f.actual ?? ''}`)
    .sort()
    .join('\n');
  const payload = [
    report.runId,
    report.appId,
    report.gate,
    JSON.stringify(report.summary?.counts ?? {}),
    report.meta?.targetUrl ?? '',
    report.meta?.buildIdentification?.buildId ?? report.buildId ?? '',
    fails,
  ].join('::');
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 32);
}
