/** Check IDs that must be re-evaluated when retesting dependent checks. */
const PREREQ_GRAPH = {
  'l1.links.coverage': ['l1.readiness.application', 'l1.reachability.http-status'],
  'l1.links.broken': ['l1.readiness.application', 'l1.reachability.http-status'],
};

/**
 * @param {string[]} checkFilter
 * @returns {Set<string>}
 */
export function expandRetestCheckIds(checkFilter) {
  const expanded = new Set(checkFilter ?? []);
  for (const id of checkFilter ?? []) {
    for (const [dependent, prereqs] of Object.entries(PREREQ_GRAPH)) {
      if (id === dependent || id.startsWith('l1.links.')) {
        for (const p of prereqs) expanded.add(p);
      }
    }
    if (id.startsWith('l1.readiness')) {
      expanded.add('l1.reachability.http-status');
    }
  }
  return expanded;
}

/**
 * Merge prior findings with a partial re-run. Non-retested checks keep prior rows (marked preserved).
 * @param {object[]} priorFindings
 * @param {object[]} newFindings
 * @param {Set<string>} retestCheckIds
 */
export function mergeRetestFindings(priorFindings, newFindings, retestCheckIds) {
  if (!retestCheckIds?.size) return newFindings;

  const newByCheck = new Map();
  for (const f of newFindings) {
    newByCheck.set(f.checkId, f);
  }

  const merged = [];
  const seen = new Set();

  for (const f of priorFindings) {
    if (retestCheckIds.has(f.checkId)) continue;
    merged.push({ ...f, preservedFromRun: f.preservedFromRun ?? true });
    seen.add(f.checkId);
  }

  for (const id of retestCheckIds) {
    const fresh = newByCheck.get(id);
    if (fresh) {
      merged.push(fresh);
      seen.add(id);
    }
  }

  for (const f of newFindings) {
    if (seen.has(f.checkId)) continue;
    if (f.checkId === 'l1.scope.disclosure') {
      merged.push(f);
      seen.add(f.checkId);
    }
  }

  return merged;
}
