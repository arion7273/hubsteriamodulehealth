import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFinding } from '../findings.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function loadWorkflowTemplates() {
  const p = path.join(__dirname, '../../registry/workflows/templates.json');
  return JSON.parse(fs.readFileSync(p, 'utf8')).templates;
}

/**
 * @param {object} ctx
 */
export async function runLevel3Workflows(ctx) {
  const findings = [];
  const { app, environment, workflowIds } = ctx;
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
          title: `Workflow template not configured: ${wf.label}`,
          actual: wf.note,
          remediation: { summary: 'Adapt recipe steps to real routes and verify in staging.' },
        }),
      );
      continue;
    }
    findings.push(
      createFinding({
        checkId: `l3.workflow.${wf.id}`,
        appId: app.id,
        environment,
        level: 3,
        status: 'not_tested',
        severity: 'info',
        title: `Workflow execution not implemented: ${wf.label}`,
        actual: 'Recipe engine stub — configure steps before execution.',
      }),
    );
  }
  return findings;
}
