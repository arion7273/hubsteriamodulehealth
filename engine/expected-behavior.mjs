import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.join(__dirname, '../registry/expected-behavior');

export function loadExpectedBehaviorManifest(appId) {
  const p = path.join(MANIFEST_DIR, `${appId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * @param {string} appId
 * @param {string} workflowId
 */
export function requirementForWorkflow(appId, workflowId) {
  const manifest = loadExpectedBehaviorManifest(appId);
  if (!manifest) return null;
  return manifest.requirements?.find((r) => r.workflows?.includes(workflowId)) ?? null;
}

export function classifyGapFinding(finding, manifest) {
  if (!finding) return 'unknown';
  if (finding.status === 'blocked') return 'test_blocked';
  if (finding.status === 'not_tested') return 'no_coverage';
  if (finding.status === 'fail' && finding.meta?.tool === 'workflow-executor') return 'confirmed_defect';
  if (finding.status === 'pass') return 'requirement_met';
  return 'informational';
}
