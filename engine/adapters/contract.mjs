import crypto from 'node:crypto';
import { createFinding } from '../findings.mjs';

export const STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  BLOCKED: 'blocked',
  NOT_TESTED: 'not_tested',
  NOT_APPLICABLE: 'not_applicable',
};

/**
 * @typedef {object} NormalizedToolResult
 * @property {string} tool
 * @property {string} toolVersion
 * @property {string} [rulesetVersion]
 * @property {string} pack
 * @property {string} checkId
 * @property {string} status
 * @property {string} severity
 * @property {string} title
 * @property {string} [expected]
 * @property {string} [actual]
 * @property {string} [detail]
 * @property {object[]} [evidence]
 * @property {string} [file]
 * @property {number} [line]
 * @property {string} [url]
 * @property {object} [remediation]
 * @property {number} durationMs
 * @property {string} fingerprint
 * @property {boolean} [scannerFinding]
 * @property {string} [suspectedCause]
 */

export function fingerprint(parts) {
  return crypto.createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 20);
}

/**
 * @param {NormalizedToolResult} r
 * @param {object} ctx
 */
export function toFinding(r, ctx) {
  return createFinding({
    checkId: r.checkId,
    appId: ctx.appId,
    moduleId: ctx.moduleId ?? null,
    environment: ctx.environment,
    level: ctx.level ?? 1,
    status: r.status,
    severity: r.severity,
    title: r.title,
    expected: r.expected,
    actual: r.actual,
    detail: r.detail,
    evidence: r.evidence ?? [],
    remediation: r.remediation,
    suspectedCause: r.suspectedCause,
    verifiedObservation: !r.scannerFinding,
    durationMs: r.durationMs,
    dedupeKey: r.fingerprint,
    fix: r.fix,
    userImpact: r.userImpact,
    acceptanceCriteria: r.acceptanceCriteria,
    meta: {
      tool: r.tool,
      toolVersion: r.toolVersion,
      pack: r.pack,
      rulesetVersion: r.rulesetVersion,
      tools: r.tool ? [r.tool] : [],
    },
    durationMs: r.durationMs,
  });
}

export function blockedResult(adapter, pack, reason, ctx, extra = {}) {
  const checkId = `${adapter.id}.preflight`;
  return toFinding(
    {
      tool: adapter.id,
      toolVersion: adapter.version,
      pack,
      checkId,
      status: STATUS.BLOCKED,
      severity: 'info',
      title: `${adapter.name} not available`,
      actual: reason,
      durationMs: 0,
      fingerprint: fingerprint([adapter.id, pack, 'blocked', reason]),
      ...extra,
    },
    ctx,
  );
}
