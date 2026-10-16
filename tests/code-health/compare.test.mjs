import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareToBaseline } from '../../code-health/core/compare-baseline.mjs';

const baseFinding = {
  id: 'CH-TEST-1',
  fingerprint: 'fp-old',
  category: 'lint',
  priority: 'low',
  confidence: 'high',
  cleanupRisk: 'low',
  locations: [],
  scanner: 'eslint',
  evidence: {},
  summary: 'old',
  whyItMatters: '',
  proposedChange: '',
  affectedWorkflows: [],
  verificationRequired: [],
  status: 'open',
};

test('compareToBaseline without baseline does not infer resolved', () => {
  const result = compareToBaseline([baseFinding], null, [{ id: 'eslint', status: 'completed', findings: [] }]);
  assert.equal(result.baselinePresent, false);
  assert.equal(result.resolvedFindings.length, 0);
});

test('compareToBaseline skips resolved inference when scanner failed', () => {
  const baseline = {
    meta: { commit: 'abc' },
    findings: [baseFinding],
  };
  const result = compareToBaseline([], baseline, [{ id: 'knip', status: 'failed', findings: [] }]);
  assert.equal(result.resolvedFindings.length, 0);
  assert.ok(result.notes.some((n) => n.includes('Scanner failure')));
});

test('compareToBaseline detects new and resolved fingerprints', () => {
  const baseline = {
    meta: { commit: 'abc' },
    findings: [baseFinding],
  };
  const newF = { ...baseFinding, fingerprint: 'fp-new', id: 'CH-NEW' };
  const result = compareToBaseline([newF], baseline, [{ id: 'eslint', status: 'completed', findings: [] }]);
  assert.equal(result.newFindings.length, 1);
  assert.equal(result.resolvedFindings.length, 1);
});
