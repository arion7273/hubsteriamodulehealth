import { createHash } from 'node:crypto';

/**
 * Stable short id from fingerprint (same input => same id across runs).
 * @param {string} categoryPrefix e.g. DUP, KNIP
 * @param {string} fingerprint
 */
export function stableFindingId(categoryPrefix, fingerprint) {
  const hash = createHash('sha256').update(fingerprint).digest('hex').slice(0, 8);
  return `CH-${categoryPrefix}-${hash}`;
}

/**
 * @param {string} input
 */
export function fingerprint(input) {
  return createHash('sha256').update(input).digest('hex');
}
