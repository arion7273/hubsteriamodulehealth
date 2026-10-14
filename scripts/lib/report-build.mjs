import { summarize } from './runner.mjs';

/**
 * @param {import('./types.mjs').Finding[]} findings
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {object} meta
 */
export function buildReport(findings, manifest, meta = {}) {
  const summary = summarize(findings);
  const modules = (manifest.modules ?? []).map((mod) => {
    const modFindings = findings.filter((f) => f.moduleId === mod.moduleId);
    const total = modFindings.length;
    const pass = modFindings.filter((f) => f.status === 'pass').length;
    const byCategory = {};
    for (const f of modFindings) {
      byCategory[f.category] = byCategory[f.category] ?? { pass: 0, total: 0 };
      byCategory[f.category].total++;
      if (f.status === 'pass') byCategory[f.category].pass++;
    }
    return {
      moduleId: mod.moduleId,
      displayName: mod.displayName,
      total,
      pass,
      passRate: total ? Math.round((pass / total) * 100) : 0,
      byCategory,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    gate: summary.gate,
    summary,
    modules,
    findings,
    meta,
  };
}
