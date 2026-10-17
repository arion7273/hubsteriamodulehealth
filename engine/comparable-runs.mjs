import { assessRunComparability } from './run-comparability.mjs';

function normalizeTargetUrl(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    u.hash = '';
    if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.replace(/\/$/, '');
    return u.href;
  } catch {
    return String(url).trim();
  }
}

/**
 * @param {object} current - normalized report
 * @param {object[]} rawRuns - from listRuns (may be unnormalized)
 */
export function listComparableBaselineRuns(current, rawRuns) {
  const target = normalizeTargetUrl(current.meta?.targetUrl);
  return (rawRuns ?? [])
    .filter((r) => r.runId && r.runId !== current.runId)
    .filter((r) => r.appId === current.appId && r.environment === current.environment)
    .filter((r) => !target || normalizeTargetUrl(r.meta?.targetUrl) === target)
    .map((r) => {
      const baseline = {
        runId: r.runId,
        generatedAt: r.generatedAt,
        targetUrl: r.meta?.targetUrl ?? null,
        packsExecuted: r.packsExecuted ?? [],
        levels: r.levels ?? [1],
        comparability: assessRunComparability(r, current),
      };
      return {
        ...baseline,
        recommended: baseline.comparability.comparable || baseline.comparability.partial,
      };
    })
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}
