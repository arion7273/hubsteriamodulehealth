import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { buildCursorFixPrompt } from '../engine/findings.mjs';
import {
  ensureDataDirs,
  loadRegistry,
  saveUserApp,
  listRuns,
  getRun,
  loadModuleSettings,
  saveModuleSettings,
} from './storage.mjs';
import { enqueueRun, cancelRun, getJob, listJobs } from './run-queue.mjs';
import { scheduleStatus, startScheduler } from './scheduler.mjs';
import { PACK_DEFINITIONS, packsForInputMode } from '../engine/packs/definitions.mjs';
import { exportMigrationBundle, importMigrationBundle } from '../scripts/lib/migrate-cloud.mjs';
import { resolveEvidenceFile } from './evidence-files.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 4177);
const HOST = process.env.HOST ?? '127.0.0.1';

ensureDataDirs();
const app = express();
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: corsOrigins?.length ? corsOrigins : true,
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
  }),
);
app.use(express.json({ limit: '2mb' }));

app.use('/fixtures', express.static(path.join(ROOT, 'fixtures')));
app.use('/evidence', express.static(path.join(ROOT, 'data/evidence')));

const webDist = path.join(ROOT, 'web/dist');
app.use(express.static(webDist));

function requireMigrationAuth(req, res, next) {
  const token = process.env.MIGRATION_TOKEN;
  if (!token) return next();
  const auth = req.headers.authorization ?? '';
  if (auth === `Bearer ${token}`) return next();
  res.status(401).json({ error: 'migration auth required' });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'hubsteriamodulehealth' }));

app.get('/api/files', (req, res) => {
  const ref = req.query.path;
  const abs = resolveEvidenceFile(ref);
  if (!abs) return res.status(404).json({ error: 'file not found or not allowed' });
  res.sendFile(abs);
});

app.get('/api/packs', (req, res) => {
  const inputMode = req.query.inputMode ?? 'url';
  const packs = packsForInputMode(inputMode).map((id) => ({
    id,
    ...PACK_DEFINITIONS[id],
  }));
  res.json({
    inputMode,
    packs,
    note:
      inputMode === 'html'
        ? 'HTML snapshot mode cannot execute repository tools or live backend verification.'
        : inputMode === 'repository'
          ? 'Repository mode runs static analysis and tests; it does not prove live user transactions.'
          : 'URL mode exercises rendered pages; it does not replace source-code inspection.',
  });
});

app.get('/api/migrate/export', requireMigrationAuth, (req, res) => {
  const includeRuns = req.query.runs === '1';
  const maxRuns = Number(req.query.maxRuns ?? 200);
  res.json(exportMigrationBundle({ includeRuns, maxRuns, note: 'api-export' }));
});

app.post('/api/migrate/import', requireMigrationAuth, (req, res) => {
  try {
    const report = importMigrationBundle(req.body, {
      merge: !!req.body?.merge,
      dryRun: !!req.query.dryRun,
      replaceRuns: !!req.body?.replaceRuns,
    });
    res.json(report);
  } catch (e) {
    res.status(400).json({ error: String(e?.message ?? e) });
  }
});

app.get('/api/registry', (_req, res) => {
  const reg = loadRegistry();
  const safe = {
    ...reg,
    apps: reg.apps.map((a) => ({
      ...a,
      testAccountRefs: a.testAccountRefs,
    })),
  };
  res.json(safe);
});

app.post('/api/apps', (req, res) => {
  const { name, baseUrl, url } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const id = `app-${crypto.randomBytes(4).toString('hex')}`;
  const entry = {
    id,
    name,
    description: req.body.description ?? `Added via UI`,
    baseUrl: baseUrl ?? url ?? null,
    environments: [
      {
        id: 'custom',
        label: 'Custom URL',
        baseUrl: baseUrl ?? url ?? null,
        mutationsAllowed: false,
      },
    ],
    modules: [],
    criticalWorkflows: [],
    testAccountRefs: [],
    integrations: [],
    schedules: { enabled: false },
    budgets: { pageLimit: 15, timeoutMs: 45000 },
  };
  saveUserApp(entry);
  res.status(201).json(entry);
});

app.get('/api/apps/:appId/settings', (req, res) => {
  res.json(loadModuleSettings(req.params.appId));
});

app.put('/api/apps/:appId/settings', (req, res) => {
  saveModuleSettings(req.params.appId, req.body);
  res.json(loadModuleSettings(req.params.appId));
});

app.get('/api/schedules', (_req, res) => {
  res.json({ schedules: scheduleStatus(), timezone: loadRegistry().global?.timezone });
});

app.get('/api/runs', (req, res) => {
  const appId = req.query.appId;
  res.json({ runs: listRuns(appId) });
});

app.get('/api/runs/:runId', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  res.json(report);
});

app.get('/api/jobs/:runId', (req, res) => {
  const job = getJob(req.params.runId);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json({
    runId: job.runId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    error: job.error,
  });
});

app.get('/api/jobs', (_req, res) => res.json({ jobs: listJobs() }));

app.post('/api/runs', async (req, res) => {
  const body = req.body;
  if (!body.appId) return res.status(400).json({ error: 'appId required' });
  const job = await enqueueRun(body);
  res.status(202).json({ runId: job.runId, status: job.status });
});

app.post('/api/runs/:runId/retest', async (req, res) => {
  const prior = getRun(req.params.runId);
  if (!prior) return res.status(404).json({ error: 'prior run not found' });
  const mode = req.body?.mode ?? 'failed';
  let levels = prior.levels ?? [1];
  let checkFilter = null;
  if (mode === 'finding' && req.body?.checkId) {
    checkFilter = [req.body.checkId];
    levels = [1];
  } else if (mode === 'failed') {
    checkFilter = prior.findings.filter((f) => f.status === 'fail').map((f) => f.checkId);
  }
  const job = await enqueueRun({
    appId: prior.appId,
    environment: prior.environment,
    inputMode: prior.inputMode,
    levels: prior.packsExecuted?.length ? undefined : levels,
    packs: prior.packsExecuted?.length ? prior.packsExecuted : undefined,
    repoRoot: prior.meta?.repoRoot ?? req.body?.repoRoot,
    targetUrl: prior.meta?.targetUrl ?? req.body?.targetUrl,
    retestOf: prior.runId,
    retestMode: mode,
    checkFilter,
  });
  res.status(202).json({ runId: job.runId, retestOf: prior.runId, status: job.status });
});

app.post('/api/runs/:runId/cancel', (req, res) => {
  const ok = cancelRun(req.params.runId);
  res.json({ cancelled: ok });
});

app.get('/api/findings/:runId/:findingId/cursor-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const finding = report.findings.find((f) => f.id === req.params.findingId);
  if (!finding) return res.status(404).json({ error: 'finding not found' });
  res.type('text/plain').send(buildCursorFixPrompt(finding));
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/fixtures')) {
    return res.status(404).send('Not found');
  }
  const index = path.join(webDist, 'index.html');
  res.sendFile(index, (err) => {
    if (err) res.status(404).send('UI not built. Run npm run build:web');
  });
});

startScheduler();

app.listen(PORT, HOST, () => {
  console.log(`HubsteriaModuleHealth server http://127.0.0.1:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log(`  Also reachable at http://localhost:${PORT}`);
  }
});
