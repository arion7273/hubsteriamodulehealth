import crypto from 'node:crypto';
import { generateAiReportAnalysis, aiAnalysisCacheKey, failedState } from '../ai-report-analysis.mjs';
import { getAiGatewayConfig } from '../ai-config.mjs';
import { saveAiCache, loadAiCache } from '../../server/ai-cache.mjs';
import { loadWorkspaceState, updateWorkspace } from './store.mjs';
import { fingerprintRawRun } from './raw-run-fingerprint.mjs';

const inFlight = new Set();

/**
 * @param {object} report - normalized from getRun
 * @param {{ force?: boolean }} [opts]
 */
export async function runAiAnalysisForWorkspace(report, opts = {}) {
  const cfg = getAiGatewayConfig();
  const runId = report.runId;

  if (!cfg.enabled) {
    updateWorkspace(runId, (ws) => {
      ws.ai.status = 'disabled';
      ws.ai.lastError = 'AI Gateway not configured on server';
      return ws;
    });
    return { status: 'disabled' };
  }

  if (inFlight.has(runId) && !opts.force) {
    return { status: 'analyzing' };
  }

  inFlight.add(runId);
  updateWorkspace(runId, (ws) => {
    ws.ai.status = 'analyzing';
    ws.ai.lastError = null;
    return ws;
  });

  try {
    const key = aiAnalysisCacheKey(report);
    const existing = loadAiCache(runId);
    if (!opts.force && existing?.cacheKey === key && existing?.analysis) {
      return attachRevision(runId, report, existing.analysis, key, 'complete');
    }

    const analysis = await generateAiReportAnalysis(report);
    const enriched = enrichAnalysis(analysis, report);
    saveAiCache(runId, {
      runId,
      cacheKey: key,
      savedAt: new Date().toISOString(),
      analysis: enriched,
    });
    return attachRevision(runId, report, enriched, key, enriched.status === 'degraded' ? 'degraded' : 'complete');
  } catch (e) {
    const fail = failedState(e?.message ?? String(e));
    updateWorkspace(runId, (ws) => {
      ws.ai.status = 'failed';
      ws.ai.lastError = fail.message;
      return ws;
    });
    return fail;
  } finally {
    inFlight.delete(runId);
  }
}

function enrichAnalysis(analysis, report) {
  const validIds = new Set((report.findings ?? []).filter((f) => f.status === 'fail').map((f) => f.id));
  const notes = analysis.findingNotes ?? [];
  const stripped = notes.length - (analysis.findingNotes?.length ?? 0);
  const degraded =
    notes.length === 0 && validIds.size > 0 && analysis.status !== 'disabled';

  return {
    ...analysis,
    status: degraded ? 'degraded' : analysis.status,
    label: degraded ? 'AI analysis degraded' : analysis.label,
    degradedReason: degraded
      ? 'Model output did not reference valid finding IDs after schema validation.'
      : null,
    coverageGaps: analysis.limitations ?? [],
    relatedGroups: inferRelatedGroups(report, notes),
    recommendedNextTests: buildNextTests(report),
    rawFingerprint: fingerprintRawRun(report),
  };
}

function inferRelatedGroups(report, notes) {
  const byCheck = new Map();
  for (const f of report.findings ?? []) {
    if (f.status !== 'fail') continue;
    const prefix = (f.checkId ?? '').split('.').slice(0, 2).join('.');
    if (!byCheck.has(prefix)) byCheck.set(prefix, []);
    byCheck.get(prefix).push(f.id);
  }
  return [...byCheck.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([prefix, ids]) => ({ prefix, findingIds: ids, reason: 'Shared check/tool prefix in evidence' }));
}

function buildNextTests(report) {
  const rec = [];
  if (report.inputMode === 'url') {
    rec.push('Re-run same URL with workflow pack after fixes (level 3).');
    rec.push('Add repository path for code-quality pack if defects are in source.');
  }
  if ((report.summary?.counts?.not_tested ?? 0) > 0) {
    rec.push('Unblock not-tested checks listed in coverage section.');
  }
  return rec.slice(0, 5);
}

function attachRevision(runId, report, analysis, cacheKey, status) {
  const revisionId = `air_${crypto.randomBytes(6).toString('hex')}`;
  updateWorkspace(runId, (ws) => {
    ws.ai.status = status;
    ws.ai.activeRevisionId = revisionId;
    ws.ai.revisions.push({
      id: revisionId,
      createdAt: new Date().toISOString(),
      cacheKey,
      status,
      model: analysis.model,
      analysis,
      rawFingerprint: fingerprintRawRun(report),
    });
    return ws;
  });
  return analysis;
}

export function queueAiAnalysis(runId, getRunFn, opts = {}) {
  const report = getRunFn(runId);
  if (!report) return;
  updateWorkspace(runId, (ws) => {
    if (ws.ai.status === 'analyzing') return ws;
    ws.ai.status = 'queued';
    ws.ai.queue.push({ queuedAt: new Date().toISOString() });
    return ws;
  });
  setImmediate(() => {
    runAiAnalysisForWorkspace(report, opts).catch(() => {});
  });
}

export function getWorkspaceAiStatus(runId) {
  return loadWorkspaceState(runId).ai;
}
