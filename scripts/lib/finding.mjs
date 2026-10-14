/** @typedef {'pass'|'fail'|'skip'|'blocked'} CheckStatus */
/** @typedef {'blocker'|'high'|'medium'|'low'|'info'} Severity */
/** @typedef {'discovery'|'static'|'contract'|'smoke'|'integration'|'conformance'} Layer */

/**
 * @param {Partial<import('./types.mjs').Finding>} partial
 * @returns {import('./types.mjs').Finding}
 */
export function finding(partial) {
  const { evidence, ...rest } = partial;
  return {
    evidence: evidence ?? [],
    ...rest,
  };
}

export function pass(base) {
  return finding({ ...base, status: 'pass', severity: base.severity ?? 'info' });
}

export function fail(base) {
  return finding({ ...base, status: 'fail' });
}

export function skip(base, reason) {
  return finding({
    ...base,
    status: 'skip',
    severity: 'info',
    detail: reason ?? base.detail,
  });
}

export function blocked(base, reason) {
  return finding({
    ...base,
    status: 'blocked',
    severity: 'info',
    detail: reason ?? base.detail,
  });
}
