import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { listRuns, saveRun, loadRegistry } from './storage.mjs';
import { DATA_DIR } from './storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.join(DATA_DIR, 'worker');
const WORKER_SCRIPT = path.join(__dirname, 'worker-run.mjs');

const jobs = new Map();
let active = 0;

export function getJob(runId) {
  return jobs.get(runId) ?? null;
}

export function listJobs() {
  return [...jobs.values()];
}

function pickPreviousReport(body) {
  const prevRuns = listRuns(body.appId).filter((r) => {
    if (r.environment !== body.environment) return false;
    if (body.packs?.length) {
      return JSON.stringify(r.packsExecuted ?? []) === JSON.stringify(body.packs);
    }
    return JSON.stringify(r.levels ?? [1]) === JSON.stringify(body.levels ?? [1]);
  });
  return prevRuns[0] ?? null;
}

/**
 * @param {object} body
 */
export async function enqueueRun(body) {
  const runId = `run_${crypto.randomBytes(10).toString('hex')}`;
  const registry = loadRegistry();
  const maxConcurrent = registry.global?.maxConcurrentRuns ?? 2;

  const job = {
    runId,
    status: 'queued',
    progress: 0,
    message: 'Queued',
    createdAt: new Date().toISOString(),
    cancelled: false,
    request: body,
    child: null,
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
    job.message = 'Executing checks in isolated worker';
    job.progress = 10;

    fs.mkdirSync(WORKER_DIR, { recursive: true });
    const reqPath = path.join(WORKER_DIR, `${runId}-req.json`);
    const outPath = path.join(WORKER_DIR, `${runId}-out.json`);
    const previousReport = pickPreviousReport(body);

    fs.writeFileSync(
      reqPath,
      JSON.stringify({
        body: { ...body, runId },
        outPath,
        previousRunId: previousReport?.runId ?? null,
      }),
    );

    await new Promise((resolve) => {
      const child = spawn(process.execPath, [WORKER_SCRIPT, reqPath], {
        cwd: path.join(__dirname, '..'),
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      job.child = child;

      let stderr = '';
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('close', (code) => {
        job.child = null;
        try {
          if (job.cancelled) {
            job.status = 'cancelled';
            job.message = 'Cancelled';
            resolve();
            return;
          }
          if (code !== 0 || !fs.existsSync(outPath)) {
            job.status = 'failed';
            job.message = stderr.slice(0, 500) || `Worker exited with code ${code}`;
            job.error = job.message;
            resolve();
            return;
          }
          const report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
          job.status = 'completed';
          job.progress = 100;
          job.message = 'Complete';
          saveRun(report);
          job.report = report;
        } catch (e) {
          job.status = 'failed';
          job.message = String(e?.message ?? e);
          job.error = job.message;
        } finally {
          try {
            fs.unlinkSync(reqPath);
          } catch {
            /* ignore */
          }
          resolve();
        }
      });
    });

    active--;
  };

  start();
  return job;
}

export function cancelRun(runId) {
  const job = jobs.get(runId);
  if (!job) return false;
  job.cancelled = true;
  if (job.child) {
    job.child.kill('SIGTERM');
    setTimeout(() => {
      if (job.child) job.child.kill('SIGKILL');
    }, 5000);
  }
  if (job.status === 'queued') job.status = 'cancelled';
  return true;
}
