import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emptyWorkspaceState, WORKSPACE_SCHEMA_VERSION } from './schema.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = path.join(__dirname, '../../data/workspace');

export function ensureWorkspaceDir() {
  fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
}

export function workspacePath(runId) {
  return path.join(WORKSPACE_DIR, `${runId}.json`);
}

export function loadWorkspaceState(runId) {
  ensureWorkspaceDir();
  const file = workspacePath(runId);
  if (!fs.existsSync(file)) return emptyWorkspaceState(runId);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { ...emptyWorkspaceState(runId), ...raw, workspaceVersion: WORKSPACE_SCHEMA_VERSION };
  } catch {
    return emptyWorkspaceState(runId);
  }
}

export function saveWorkspaceState(state) {
  ensureWorkspaceDir();
  const next = { ...state, updatedAt: new Date().toISOString(), workspaceVersion: WORKSPACE_SCHEMA_VERSION };
  fs.writeFileSync(workspacePath(state.runId), JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

export function updateWorkspace(runId, mutator) {
  const current = loadWorkspaceState(runId);
  const next = mutator(current) ?? current;
  return saveWorkspaceState({ ...next, runId });
}
