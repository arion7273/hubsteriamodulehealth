#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createFinding } from '../engine/findings.mjs';
import { normalizeRunReport } from '../engine/report-normalize.mjs';
import { compareRunsDetailed } from '../engine/run-changes.mjs';
import { buildCursorRepairPrompt } from '../engine/cursor-repair-prompt.mjs';
import { findingIdentityKey } from '../engine/finding-identity.mjs';

function baseRun(findings, runId, meta = {}) {
  return normalizeRunReport({
    runId,
    appId: 'adhoc-url-scan',
    appName: 'Test',
    environment: 'custom',
    inputMode: 'url',
    levels: [1],
    packsExecuted: ['quick-health', 'ui-a11y'],
    generatedAt: new Date().toISOString(),
    gate: 'fix_blockers',
    findings,
    meta: { targetUrl: 'https://example.com', ...meta },
  });
}

function fail(checkId, id) {
  return createFinding({
    id,
    checkId,
    appId: 'adhoc-url-scan',
    environment: 'custom',
    status: 'fail',
    severity: 'high',
    title: `Fail ${checkId}`,
    actual: 'broken',
    evidence: [{ type: 'text', value: 'fixture' }],
  });
}

function pass(checkId, id) {
  return createFinding({
    id,
    checkId,
    appId: 'adhoc-url-scan',
    environment: 'custom',
    status: 'pass',
    severity: 'info',
    title: `Pass ${checkId}`,
  });
}

// Initial run — no baseline
const run1 = baseRun([fail('axe.rule.color-contrast', 'f1')], 'run_a');
assert.equal(run1.comparison, undefined, 'no comparison without getRun chain');

// Verified fix
const run2Findings = [pass('axe.rule.color-contrast', 'f2')];
const run2Raw = {
  ...JSON.parse(JSON.stringify(run1)),
  runId: 'run_b',
  findings: run2Findings,
  meta: { targetUrl: 'https://example.com', previousRunId: 'run_a' },
};
delete run2Raw.comparison;
delete run2Raw.reportFirst;
delete run2Raw.qaAudit;
const run2 = normalizeRunReport(run2Raw);
const delta = compareRunsDetailed(run1, run2);
assert.equal(delta.verifiedFixed.length, 1, 'verified fixed');
assert.equal(delta.stillFailing.length, 0);

// Still failing (baseline and current both fail same check)
const run3 = baseRun([fail('axe.rule.color-contrast', 'f3')], 'run_c');
const d3 = compareRunsDetailed(run1, run3);
assert.equal(d3.stillFailing.length, 1);

// New failure
const run4 = baseRun([pass('axe.rule.color-contrast', 'f4a'), fail('axe.rule.region', 'f4b')], 'run_d');
const d4 = compareRunsDetailed(run2, run4);
assert.equal(d4.newFailures.length, 1);

// Returned regression
const run5 = baseRun([fail('axe.rule.color-contrast', 'f5')], 'run_e');
const d5 = compareRunsDetailed(run2, run5);
assert.equal(d5.returned.length, 1);

// Stable identity
const k1 = findingIdentityKey(fail('axe.rule.color-contrast', 'x'), { appId: 'adhoc-url-scan' });
const k2 = findingIdentityKey(fail('axe.rule.color-contrast', 'y'), { appId: 'adhoc-url-scan' });
assert.equal(k1, k2);

// Repair prompt includes IDs
const prompt = buildCursorRepairPrompt(run1, { findingIds: ['f1'] });
assert.match(prompt, /f1/);
assert.match(prompt, /axe\.rule\.color-contrast/);
assert.match(prompt, /Do not.*claim completion/i);

console.log('verify-report-comparison: ok');
