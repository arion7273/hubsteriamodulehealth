import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildBaselineFromReport } from '../../code-health/core/compare-baseline.mjs';

test('buildBaselineFromReport captures fingerprints for compare', () => {
  const report = {
    schemaVersion: '1.0.0',
    reportId: 'r1',
    meta: { commit: 'c1', scanTimeIso: '2026-01-01T00:00:00.000Z' },
    scanners: [{ id: 'jscpd', status: 'failed', version: '1' }],
    findings: [
      {
        id: 'CH-X',
        fingerprint: 'fp',
        category: 'duplication',
        status: 'open',
      },
    ],
  };
  const baseline = buildBaselineFromReport(report);
  assert.equal(baseline.findingFingerprints.length, 1);
  assert.equal(baseline.scanners[0].status, 'failed');
});
