import crypto from 'node:crypto';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry, listRuns, saveRun, loadModuleSettings } from './storage.mjs';

const jobs = new Map();
let active = 0;

export function getJob(runId) {
  return jobs.get(runId) ?? null;
}

export function listJobs() {
  return [...jobs.values()];
}

/**
 * @param {object} body
 */
export async function enqueueRun(body) {
  const registry = loadRegistry();
  const runId = `run_${crypto.randomBytes(10).toString('hex')}`;
  const maxConcurrent = registry.global?.maxConcurrentRuns ?? 2;

  const job = {
    runId,
    status: 'queued',
    progress: 0,
    message: 'Queued',
    createdAt: new Date().toISOString(),
    cancelled: false,
    request: body,
  };
  jobs.set(runId, job);

  const start = async () => {
    if (job.cancelled) {
      job.status = 'cancelled';
      return;
    }
    if (active >= maxConcurrent) {
      setTimeout(start, 250);
      return;
    }
    active++;
    job.status = 'running';
    job.message = 'Executing checks';
    job.progress = 10;
    try {
      const settings = loadModuleSettings(body.appId);
      const prevRuns = listRuns(body.appId).filter(
        (r) => r.environment === body.environment && JSON.stringify(r.levels) === JSON.stringify(body.levels ?? [1]),
      );
      const previousReport = prevRuns[0] ?? null;

      const report = await executeRun(
        {
          ...body,
          runId,
          moduleSettings: settings,
        },
        registry,
        previousReport,
      );
      if (job.cancelled) {
        job.status = 'cancelled';
        report.meta = { ...report.meta, cancelled: true };
      } else {
        job.status = 'completed';
        job.progress = 100;
        job.message = 'Complete';
      }
      saveRun(report);
      job.report = report;
    } catch (e) {
      job.status = 'failed';
      job.message = String(e?.message ?? e);
      job.error = String(e?.message ?? e);
    } finally {
      active--;
    }
  };

  start();
  return job;
}

export function cancelRun(runId) {
  const job = jobs.get(runId);
  if (!job) return false;
  job.cancelled = true;
  if (job.status === 'queued') job.status = 'cancelled';
  return true;
}
