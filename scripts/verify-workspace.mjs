#!/usr/bin/env node
import assert from 'node:assert/strict';
import { buildWorkspaceBundle } from '../engine/workspace/build-workspace.mjs';
import fs from 'node:fs';
import { loadWorkspaceState, saveWorkspaceState, workspacePath } from '../engine/workspace/store.mjs';
import { fingerprintRawRun } from '../engine/workspace/raw-run-fingerprint.mjs';
import { createRepairPlan } from '../engine/workspace/repair-worker.mjs';
import { getRun, saveRun } from '../server/storage.mjs';
import { normalizeRunReport } from '../engine/report-normalize.mjs';
import { createFinding } from '../engine/findings.mjs';

const runId = 'run_workspace_fixture';
const wsFile = workspacePath(runId);
if (fs.existsSync(wsFile)) fs.unlinkSync(wsFile);
const raw = normalizeRunReport({
  runId,
  appId: 'workflow-gap-fixture',
  appName: 'Workflow Gap Fixture',
  environment: 'local',
  inputMode: 'url',
  levels: [3],
  generatedAt: new Date().toISOString(),
  gate: 'fix_blockers',
  findings: [
    createFinding({
      id: 'fnd_ws_1',
      checkId: 'l3.workflow.gap-create-persist.summary',
      appId: 'workflow-gap-fixture',
      environment: 'local',
      status: 'fail',
      severity: 'high',
      title: 'Workflow failed (fixture)',
      actual: 'broken-persist',
      expected: 'persistence',
    }),
  ],
  meta: { targetUrl: 'http://127.0.0.1:4177/fixtures/workflow-app/create.html' },
});

saveRun(raw);
const report = getRun(runId);
assert.ok(report, 'getRun');

const fp1 = fingerprintRawRun(report);
const bundle = buildWorkspaceBundle(report, loadWorkspaceState(runId));
assert.equal(bundle.issues.total, 1);
assert.equal(bundle.raw.fingerprint, fp1);
assert.ok(bundle.ai.disclaimer.includes('cannot'));

const { repairId } = await createRepairPlan(report, ['fnd_ws_1']);
assert.ok(repairId);
const ws = loadWorkspaceState(runId);
assert.equal(ws.repairs.length, 1);
assert.ok(ws.repairs[0].plan.cursorPrompt.includes('fnd_ws_1'));

console.log('verify-workspace: ok');
