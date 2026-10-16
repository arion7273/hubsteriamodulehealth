import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFindings } from '../../code-health/core/normalize-findings.mjs';

test('normalizeFindings dedupes by fingerprint and preserves accepted status', () => {
  const scanners = [
    {
      id: 'x',
      name: 'x',
      status: 'completed',
      durationMs: 1,
      findings: [
        {
          category: 'lint',
          priority: 'medium',
          confidence: 'high',
          cleanupRisk: 'low',
          locations: [{ file: 'a.mjs', line: 1 }],
          scanner: 'eslint',
          evidence: {},
          summary: 'dup',
          whyItMatters: 'w',
          proposedChange: 'p',
          affectedWorkflows: [],
          verificationRequired: [],
          status: 'open',
          fingerprint: 'fp1',
        },
        {
          category: 'lint',
          priority: 'high',
          confidence: 'high',
          cleanupRisk: 'low',
          locations: [{ file: 'a.mjs', line: 1 }],
          scanner: 'eslint',
          evidence: {},
          summary: 'dup2',
          whyItMatters: 'w',
          proposedChange: 'p',
          affectedWorkflows: [],
          verificationRequired: [],
          status: 'open',
          fingerprint: 'fp1',
        },
      ],
    },
  ];
  const prior = new Map([
    [
      'fp1',
      {
        fingerprint: 'fp1',
        status: 'accepted',
        statusReason: 'intentional',
      },
    ],
  ]);
  const out = normalizeFindings(scanners, prior);
  assert.equal(out.length, 1);
  assert.equal(out[0].status, 'accepted');
  assert.equal(out[0].priority, 'high');
});

test('failed scanner marks findings unverified', () => {
  const scanners = [
    {
      id: 'knip',
      name: 'knip',
      status: 'failed',
      durationMs: 1,
      findings: [
        {
          category: 'unused-code',
          priority: 'medium',
          confidence: 'medium',
          cleanupRisk: 'high',
          locations: [{ file: 'z.mjs' }],
          scanner: 'knip',
          evidence: {},
          summary: 'maybe unused',
          whyItMatters: 'w',
          proposedChange: 'p',
          affectedWorkflows: [],
          verificationRequired: [],
          status: 'open',
          fingerprint: 'fpz',
        },
      ],
    },
  ];
  const out = normalizeFindings(scanners);
  assert.equal(out[0].status, 'unverified');
});
