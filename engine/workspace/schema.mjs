/** @typedef {'queued'|'analyzing'|'complete'|'degraded'|'failed'|'disabled'|'pending'} AiWorkflowStatus */
/** @typedef {'proposed'|'patch_generated'|'applied'|'verification_failed'|'verified_fixed'|'blocked'} RepairStatus */

export const WORKSPACE_SCHEMA_VERSION = 1;

export function emptyWorkspaceState(runId) {
  return {
    workspaceVersion: WORKSPACE_SCHEMA_VERSION,
    runId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ai: {
      status: 'pending',
      queue: [],
      revisions: [],
      activeRevisionId: null,
      lastError: null,
    },
    repairs: [],
    verificationRuns: [],
  };
}
