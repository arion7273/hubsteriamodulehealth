/**
 * Build an ordered cleanup plan from findings (first batch for Prompt 2).
 * @param {import('./types.mjs').CodeHealthFinding[]} findings
 * @param {number} [batchSize]
 */
export function buildCleanupPlan(findings, batchSize = 8) {
  const open = findings.filter((f) => f.status === 'open' || f.status === 'unverified');
  const scored = open.map((f) => ({
    finding: f,
    score: planScore(f),
  }));
  scored.sort((a, b) => b.score - a.score);

  const batch = scored.slice(0, batchSize).map((s) => s.finding);
  const byCategory = {};
  for (const f of open) {
    byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
  }

  return {
    totalOpen: open.length,
    byCategory,
    recommendedBatch: batch.map((f) => ({
      id: f.id,
      category: f.category,
      priority: f.priority,
      summary: f.summary,
      cleanupRisk: f.cleanupRisk,
      verificationRequired: f.verificationRequired,
    })),
    deferred: scored.slice(batchSize).map((s) => s.finding.id),
  };
}

/**
 * @param {import('./types.mjs').CodeHealthFinding} f
 */
function planScore(f) {
  const pri = { critical: 100, high: 70, medium: 40, low: 10 }[f.priority] ?? 0;
  const risk = { low: 15, medium: 5, high: -10 }[f.cleanupRisk] ?? 0;
  const conf = { high: 10, medium: 5, low: 0 }[f.confidence] ?? 0;
  const cat = { 'unused-dependency': 8, lint: 12, duplication: 6, 'bundle-bloat': 4 }[f.category] ?? 0;
  return pri + risk + conf + cat;
}
