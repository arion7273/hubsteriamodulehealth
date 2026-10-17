#!/usr/bin/env node
/**
 * Workflow executor: broken variants must fail, fixed variants must pass.
 */
import assert from 'node:assert/strict';
import { executeWorkflowRecipe } from '../engine/workflows/executor.mjs';
import { loadWorkflowRecipeFile } from '../engine/workflows/load-recipe.mjs';
import { runLevel3Workflows } from '../engine/levels/level3-workflows.mjs';
import { loadRegistry } from '../server/storage.mjs';
import { executeRun } from '../engine/run-executor.mjs';
import { ensureLocalServer } from './lib/ensure-local-server.mjs';

const BASE = 'http://127.0.0.1:4177/fixtures/workflow-app';

async function runRecipe(recipeFile, workflowId, variant) {
  const recipe = loadWorkflowRecipeFile(recipeFile);
  assert.ok(recipe, recipeFile);
  return executeWorkflowRecipe({
    recipe,
    workflowId,
    requirementId: `REQ-TEST-${workflowId}`,
    ctx: {
      appId: 'workflow-gap-fixture',
      environment: 'local',
      runId: `run_wf_verify_${workflowId}_${variant}`,
      targetUrl: BASE,
      variant,
    },
  });
}

async function expectFail(recipeFile, id, variant) {
  const r = await runRecipe(recipeFile, id, variant);
  assert.equal(r.ok, false, `${id} ${variant} should fail`);
}

async function expectPass(recipeFile, id, variant) {
  const r = await runRecipe(recipeFile, id, variant);
  assert.equal(r.ok, true, `${id} ${variant} should pass`);
}

async function main() {
  await ensureLocalServer(4177);

  await expectFail('gap-create-persist.json', 'gap-create-persist', 'broken-persist');
  await expectPass('gap-create-persist.json', 'gap-create-persist', 'fixed');

  await expectFail('gap-edit-downstream.json', 'gap-edit-downstream', 'broken-downstream');
  await expectPass('gap-edit-downstream.json', 'gap-edit-downstream', 'fixed');

  await expectPass('gap-role-deny.json', 'gap-role-deny', 'fixed');

  await expectFail('gap-nav.json', 'gap-nav', 'broken');
  await expectPass('gap-nav.json', 'gap-nav', 'fixed');

  await expectFail('gap-validation.json', 'gap-validation', 'broken-validation');
  await expectPass('gap-validation.json', 'gap-validation', 'fixed');

  const registry = loadRegistry();
  const run = await executeRun(
    {
      runId: `run_wf_l3_${Date.now()}`,
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
  assert.ok(summaries.length >= 5, 'L3 pack produced workflow summaries');
  assert.ok(
    summaries.every((s) => s.status === 'pass'),
    `L3 integrated run should pass on fixed defaults: ${summaries.map((s) => s.checkId).join(', ')}`,
  );

  console.log('verify-workflow-executor: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
