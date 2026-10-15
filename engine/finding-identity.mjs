import crypto from 'node:crypto';

const COMPLETED = new Set(['pass', 'fail']);

/**
 * Stable identity for run-to-run comparison (no timestamps or volatile error text).
 * @param {object} f - finding
 * @param {object} [ctx]
 */
export function findingIdentityKey(f, ctx = {}) {
  const parts = [
    ctx.appId ?? f.appId ?? '',
    f.checkId ?? '',
    f.moduleId ?? '',
    normalizeRoute(f.route),
    f.role ?? '',
    f.environment ?? ctx.environment ?? '',
  ];
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

function normalizeRoute(route) {
  if (!route) return '';
  try {
    const u = new URL(route, 'http://local');
    return u.pathname.replace(/\/$/, '') || '/';
  } catch {
    return String(route).split('?')[0];
  }
}

/**
 * @param {object[]} findings
 * @param {object} [ctx]
 * @returns {Map<string, object>}
 */
export function indexFindingsByIdentity(findings, ctx = {}) {
  const map = new Map();
  for (const f of findings ?? []) {
    const key = findingIdentityKey(f, ctx);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, f);
      continue;
    }
    if (f.status === 'fail' && existing.status !== 'fail') map.set(key, f);
  }
  return map;
}

export function isCheckExecuted(f) {
  return COMPLETED.has(f?.status);
}
