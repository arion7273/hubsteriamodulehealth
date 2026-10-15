/**
 * Whether two runs can be compared for trend / fix verification.
 * @param {object} baseline
 * @param {object} current
 */
export function assessRunComparability(baseline, current) {
  const issues = [];
  if (!baseline || !current) {
    return { comparable: false, issues: ['Missing baseline or current run.'] };
  }
  if (baseline.appId !== current.appId) issues.push(`Different appId (${baseline.appId} vs ${current.appId}).`);
  if (baseline.environment !== current.environment) {
    issues.push(`Different environment (${baseline.environment} vs ${current.environment}).`);
  }
  if (baseline.inputMode !== current.inputMode) {
    issues.push(`Different input mode (${baseline.inputMode} vs ${current.inputMode}).`);
  }
  const baseUrl = baseline.meta?.targetUrl ?? null;
  const curUrl = current.meta?.targetUrl ?? null;
  if (baseUrl && curUrl && baseUrl !== curUrl) {
    issues.push(`Different target URL (${baseUrl} vs ${curUrl}).`);
  }
  const basePacks = JSON.stringify(baseline.packsExecuted ?? []);
  const curPacks = JSON.stringify(current.packsExecuted ?? []);
  if (basePacks !== curPacks) {
    issues.push('Different packs executed — comparison is approximate.');
  }
  const baseLevels = JSON.stringify(baseline.levels ?? [1]);
  const curLevels = JSON.stringify(current.levels ?? [1]);
  if (baseLevels !== curLevels) issues.push('Different levels — some checks may be not retested.');

  return {
    comparable: issues.length === 0,
    issues,
    partial: issues.length > 0 && issues.every((i) => i.includes('approximate') || i.includes('not retested')),
  };
}
