import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFinding } from '../findings.mjs';
import { executeWorkflowRecipe } from '../workflows/executor.mjs';
import { loadWorkflowRecipeFile } from '../workflows/load-recipe.mjs';
import { requirementForWorkflow } from '../expected-behavior.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadWorkflowTemplates() {
  const p = path.join(__dirname, '../../registry/workflows/templates.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).templates;
}

function resolveTargetBase(ctx) {
  const url = ctx.targetUrl ?? ctx.app?.baseUrl;
  if (!url) return null;
  const u = new URL(url);
  if (u.pathname.endsWith('.html')) {
    u.pathname = u.pathname.replace(/\/[^/]+\.html$/, '');
  } else if (!u.pathname.endsWith('/workflow-app')) {
    u.pathname = u.pathname.replace(/\/?$/, '/workflow-app');
  }
  return u.toString().replace(/\/$/, '');
}

/**
 * @param {object} ctx
 */
export async function runLevel3Workflows(ctx) {
  const findings = [];
  const { app, environment, workflowIds, targetUrl } = ctx;
  const templates = loadWorkflowTemplates().filter((t) => t.appId === app.id);
  const selected = workflowIds?.length
    ? templates.filter((t) => workflowIds.includes(t.id))
    : templates.filter((t) => (app.criticalWorkflows ?? []).includes(t.id));

  if (!selected.length) {
    findings.push(
      createFinding({
        checkId: 'l3.workflows.none',
        appId: app.id,
        environment,
        level: 3,
        status: 'not_tested',
        severity: 'info',
        title: 'No workflows selected for this run',
        detail: 'Add criticalWorkflows on the app or pass workflowIds / workflow pack.',
      }),
    );
    return findings;
  }

  const baseUrl = resolveTargetBase({ ...ctx, targetUrl: targetUrl ?? ctx.app?.environments?.[0]?.baseUrl });

  if (!baseUrl && app.id !== 'adapter-fixture') {
    findings.push(
      createFinding({
        checkId: 'l3.workflows.target',
        appId: app.id,
        environment,
        level: 3,
        status: 'blocked',
        severity: 'medium',
        title: 'Workflow execution blocked — no target URL',
        remediation: { summary: 'Set environment baseUrl or pass targetUrl for URL workflow runs.' },
      }),
    );
    return findings;
  }

  for (const wf of selected) {
    if (!wf.configured) {
      findings.push(
        createFinding({
          checkId: `l3.workflow.${wf.id}`,
          appId: app.id,
          environment,
          level: 3,
          status: 'blocked',
          severity: 'medium',
          title: `Workflow blocked: ${wf.label}`,
          actual: wf.note,
          detail: 'BLOCKED — configure recipe, seeded data, and credentials per template note.',
          remediation: { summary: wf.note ?? 'Adapt recipe in registry/workflows.' },
          meta: { gapClass: 'test_blocked' },
        }),
      );
      continue;
    }

    const recipe = loadWorkflowRecipeFile(wf.recipeFile);
    if (!recipe) {
      findings.push(
        createFinding({
          checkId: `l3.workflow.${wf.id}`,
          appId: app.id,
          environment,
          level: 3,
          status: 'blocked',
          severity: 'high',
          title: `Workflow recipe missing: ${wf.recipeFile}`,
        }),
      );
      continue;
    }

    const req = requirementForWorkflow(app.id, wf.id);
    const variant = ctx.workflowVariant ?? wf.defaultVariant ?? 'fixed';
    const result = await executeWorkflowRecipe({
      recipe,
      workflowId: wf.id,
      requirementId: req?.id ?? null,
      ctx: {
        appId: app.id,
        environment,
        runId: ctx.runId,
        targetUrl: baseUrl,
        variant,
        role: ctx.role ?? 'staff',
        headless: true,
      },
    });
    findings.push(...result.findings);
  }

  return findings;
}
