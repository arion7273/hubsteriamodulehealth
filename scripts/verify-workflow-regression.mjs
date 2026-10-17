#!/usr/bin/env node
/**
 * Post-repair regression: fixed variants + integrated L3 (no broken-variant failure assertions).
 */
import assert from 'node:assert/strict';
import { executeWorkflowRecipe } from '../engine/workflows/executor.mjs';
import { loadWorkflowRecipeFile } from '../engine/workflows/load-recipe.mjs';
import { loadRegistry } from '../server/storage.mjs';
import { executeRun } from '../engine/run-executor.mjs';
import { ensureLocalServer } from './lib/ensure-local-server.mjs';

const BASE = 'http://127.0.0.1:4177/fixtures/workflow-app';

async function expectPass(recipeFile, id, variant) {
  const recipe = loadWorkflowRecipeFile(recipeFile);
  const r = await executeWorkflowRecipe({
    recipe,
    workflowId: id,
    requirementId: `REQ-TEST-${id}`,
    ctx: {
      appId: 'workflow-gap-fixture',
      environment: 'local',
      runId: `run_wf_regression_${id}_${variant}`,
      targetUrl: BASE,
      variant,
    },
  });
  assert.equal(r.ok, true, `${id} ${variant} should pass`);
}

async function main() {
  await ensureLocalServer(4177);

  await expectPass('gap-create-persist.json', 'gap-create-persist', 'fixed');
  await expectPass('gap-create-persist.json', 'gap-create-persist', 'broken-persist');

  await expectPass('gap-edit-downstream.json', 'gap-edit-downstream', 'fixed');
  await expectPass('gap-role-deny.json', 'gap-role-deny', 'fixed');
  await expectPass('gap-nav.json', 'gap-nav', 'fixed');
  await expectPass('gap-validation.json', 'gap-validation', 'fixed');

  const registry = loadRegistry();
  const run = await executeRun(
    {
      runId: `run_wf_l3_regression_${Date.now()}`,
      appId: 'workflow-gap-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [3],
      packs: ['workflow'],
      targetUrl: `${BASE}/create.html`,
    },
    registry,
    null,
  );
  const summaries = run.findings.filter((f) => f.checkId.endsWith('.summary'));
  assert.ok(summaries.every((s) => s.status === 'pass'), 'L3 integrated run should pass');

  console.log('verify-workflow-regression: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
