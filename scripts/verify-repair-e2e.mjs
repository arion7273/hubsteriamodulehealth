#!/usr/bin/env node
/**
 * End-to-end: broken-persist run → repair patch → apply → verify → restore fixture.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ensureLocalServer } from './lib/ensure-local-server.mjs';
import { loadRegistry, saveRun, getRun } from '../server/storage.mjs';
import { executeRun } from '../engine/run-executor.mjs';
import { buildWorkspaceBundle } from '../engine/workspace/build-workspace.mjs';
import { loadWorkspaceState, updateWorkspace } from '../engine/workspace/store.mjs';
import { queueAiAnalysis, runAiAnalysisForWorkspace } from '../engine/workspace/ai-queue.mjs';
import {
  createRepairPlan,
  generateRepairPatch,
  verifyRepair,
  applyRepairPatch,
} from '../engine/workspace/repair-worker.mjs';
import { restorePatchBackup } from '../engine/workspace/repair-apply.mjs';
import { ensureBrokenPersistFixture } from './lib/workflow-fixture-broken.mjs';
import { getAiGatewayConfig } from '../engine/ai-config.mjs';

const REPO = process.cwd();
const BASE = 'http://127.0.0.1:4177/fixtures/workflow-app';
const FIXTURE = path.join(REPO, 'fixtures/workflow-app/create.html');
const BROKEN_BLOCK_SNIPPET = "variant === 'broken-persist') {\n        status.textContent = 'Saved'";

function persistFinding(run) {
  return run.findings.find((f) => f.checkId === 'l3.workflow.gap-create-persist.summary');
}

async function main() {
  ensureBrokenPersistFixture(REPO);
  await ensureLocalServer(4177);
  const registry = loadRegistry();
  const runId = `run_repair_e2e_${Date.now()}`;

  console.log('1) Baseline run (broken-persist)…');
  const baseline = await executeRun(
    {
      runId,
      appId: 'workflow-gap-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [3],
      packs: ['workflow'],
      workflowIds: ['gap-create-persist'],
      workflowVariant: 'broken-persist',
      targetUrl: `${BASE}/create.html`,
      repoRoot: REPO,
    },
    registry,
    null,
  );
  saveRun(baseline);
  const f = persistFinding(baseline);
  assert.equal(f?.status, 'fail', `expected persist workflow fail, got ${f?.status}`);
  const stepFail = baseline.findings.find(
    (x) => x.checkId.includes('gap-create-persist') && x.status === 'fail' && x.checkId !== f.checkId,
  );
  assert.ok(stepFail || f.actual, 'expected step-level or summary persistence evidence');
  console.log('   finding:', f.checkId, f.status, 'actual:', (f.actual ?? '').slice(0, 120));
  if (stepFail) console.log('   step:', stepFail.checkId, (stepFail.actual ?? '').slice(0, 120));

  console.log('2) Workspace + AI analysis…');
  const cfg = getAiGatewayConfig();
  let aiStatus = 'skipped';
  if (cfg.enabled) {
    try {
      await runAiAnalysisForWorkspace(baseline, { force: true });
      aiStatus = loadWorkspaceState(runId).ai.status;
      const rev = loadWorkspaceState(runId).ai.revisions.at(-1);
      assert.ok(rev?.analysis?.summary, 'AI summary present');
      const note = rev?.analysis?.findingNotes?.find((n) => n.findingId === f.id);
      if (note) {
        assert.ok(note.fixHint || note.suspectedCause, 'AI note references finding');
      }
      console.log('   AI status:', aiStatus);
    } catch (e) {
      aiStatus = 'degraded';
      console.log('   AI degraded:', String(e.message).slice(0, 200));
    }
  } else {
    queueAiAnalysis(runId, getRun);
    aiStatus = loadWorkspaceState(runId).ai.status;
    console.log('   AI disabled — status:', aiStatus);
  }

  const report = getRun(runId);
  const bundle = buildWorkspaceBundle(report, loadWorkspaceState(runId));
  assert.ok(bundle.issues.total >= 1);

  console.log('3) Repair plan + patch…');
  const { repairId } = await createRepairPlan(report, [f.id]);
  const patchRes = await generateRepairPatch(report, repairId);
  assert.equal(patchRes.status, 'patch_generated');
  assert.ok(patchRes.patch?.files?.length, 'patch must include files');
  console.log('   patch files:', patchRes.patch.files.map((x) => x.path).join(', '));

  console.log('4) Apply + verify…');
  const applyRes = await applyRepairPatch(runId, repairId);
  assert.equal(applyRes.status, 'patch_applied');
  const verifyRes = await verifyRepair(runId, repairId, {
    verifyCommandId: 'verify:workflows-regression',
  });
  assert.equal(verifyRes.status, 'verified_fixed', `verify status ${verifyRes.status}`);
  assert.ok(verifyRes.retestRunId, 'linked retest run');
  const retest = getRun(verifyRes.retestRunId);
  assert.equal(persistFinding(retest)?.status, 'pass');

  const ws = loadWorkspaceState(runId);
  const repair = ws.repairs.find((r) => r.id === repairId);
  assert.equal(repair.status, 'verified_fixed');

  console.log('5) Failure paths…');
  const { repairId: emptyId } = await createRepairPlan(report, [f.id]);
  updateWorkspace(runId, (ws) => {
    const r = ws.repairs.find((x) => x.id === emptyId);
    r.patch = { rationale: 'empty test', files: [], generatedBy: 'test' };
    r.status = 'patch_generated';
    return ws;
  });
  const failVerify = await verifyRepair(runId, emptyId);
  assert.notEqual(failVerify.status, 'verified_fixed');
  assert.ok(failVerify.nextAction || failVerify.status === 'verification_failed');

  const { repairId: staleId } = await createRepairPlan(report, [f.id]);
  const firstPatch = ws.repairs.find((r) => r.id === repairId)?.patch;
  updateWorkspace(runId, (w) => {
    const r = w.repairs.find((x) => x.id === staleId);
    r.patch = { ...firstPatch, generatedBy: 'stale-test' };
    r.status = 'patch_generated';
    r.baseCommit = '0000000000000000000000000000000000000000';
    return w;
  });
  const staleApply = await applyRepairPatch(runId, staleId);
  assert.equal(staleApply.status, 'patch_stale');
  assert.ok(staleApply.nextAction);

  console.log('6) Restore fixture to broken baseline…');
  restorePatchBackup(repairId, REPO);
  ensureBrokenPersistFixture(REPO);
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  assert.ok(raw.includes(BROKEN_BLOCK_SNIPPET), 'fixture restored to broken state');

  const demoUrl = `http://127.0.0.1:4177/reports/${runId}/workspace`;
  console.log('\nverify-repair-e2e: ok');
  console.log('Demonstration workspace URL (when server running):', demoUrl);
  console.log('Baseline runId:', runId);
  console.log('Retest runId:', verifyRes.retestRunId);
  console.log('AI status during run:', aiStatus);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
