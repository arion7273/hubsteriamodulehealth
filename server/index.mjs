import { loadEnvFile } from './load-env.mjs';
loadEnvFile();

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
  loadNormalizedRunBare,
  loadModuleSettings,
  saveModuleSettings,
} from './storage.mjs';
import { compareRunsDetailed } from '../engine/run-changes.mjs';
import { listComparableBaselineRuns } from '../engine/comparable-runs.mjs';
import { buildWorkspaceBundle } from '../engine/workspace/build-workspace.mjs';
import { loadWorkspaceState } from '../engine/workspace/store.mjs';
import { runAiAnalysisForWorkspace, queueAiAnalysis } from '../engine/workspace/ai-queue.mjs';
import {
  createRepairPlan,
  generateRepairPatch,
  verifyRepair,
  applyRepairPatch,
} from '../engine/workspace/repair-worker.mjs';
import { enqueueRun, cancelRun, getJob, listJobs } from './run-queue.mjs';
import { scheduleStatus, startScheduler } from './scheduler.mjs';
import { PACK_DEFINITIONS, packsForInputMode } from '../engine/packs/definitions.mjs';
import { exportMigrationBundle, importMigrationBundle } from '../scripts/lib/migrate-cloud.mjs';
import { resolveEvidenceFile } from './evidence-files.mjs';
import { persistRunExports, readExportFile } from './run-exports.mjs';
import { buildCursorExportPack } from '../engine/cursor-export-bundle.mjs';
import { buildGapAnalysisPrompt } from '../engine/gap-analysis-prompt.mjs';
import { buildCursorFixPlanPrompt } from '../engine/cursor-fix-prompt.mjs';
import { buildCursorFixAllGapsPrompt } from '../engine/cursor-fix-all-prompt.mjs';
import { buildCursorRepairPrompt } from '../engine/cursor-repair-prompt.mjs';
import { buildReportAnalysisPrompt } from '../engine/report-analysis-prompt.mjs';
import {
  buildComprehensiveAuditPrompt,
  resolveModuleHealthApiBase,
} from '../engine/comprehensive-audit-prompt.mjs';
import { listRunPresets } from '../engine/run-presets.mjs';
import { getAiGatewayConfig } from '../engine/ai-config.mjs';
import {
  generateAiReportAnalysis,
  failedState,
  aiAnalysisCacheKey,
} from '../engine/ai-report-analysis.mjs';
import { loadAiCache, saveAiCache } from './ai-cache.mjs';
import { resolvePromptApiBase } from './prompt-api-base.mjs';
import { checkPlaywrightBrowsers } from '../engine/playwright-preflight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT ?? 4177);
const HOST =
  process.env.HOST ??
  (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RENDER
    ? '0.0.0.0'
    : '127.0.0.1');

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

app.get('/api/health', async (_req, res) => {
  const pw = await checkPlaywrightBrowsers();
  res.json({
    ok: true,
    service: 'hubsteriamodulehealth',
    playwright: pw.ok ? 'ready' : 'missing',
    playwrightDetail: pw.ok ? undefined : pw.reason,
  });
});

/** Synthetic workflow-gap-fixture API — not production PHI. */
app.get('/api/workflow-fixture/records', (req, res) => {
  const role = String(req.headers['x-wf-role'] ?? 'guest').toLowerCase();
  if (role !== 'admin') {
    return res.status(403).json({ error: 'forbidden', role });
  }
  res.json({ records: [], synthetic: true });
});

app.get('/api/files', (req, res) => {
  const ref = req.query.path;
  const abs = resolveEvidenceFile(ref);
  if (!abs) return res.status(404).json({ error: 'file not found or not allowed' });
  res.sendFile(abs);
});

app.get('/api/run-presets', (_req, res) => {
  res.json({ presets: listRunPresets() });
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

app.get('/api/ai/status', (_req, res) => {
  const cfg = getAiGatewayConfig();
  res.json({
    enabled: cfg.enabled,
    model: cfg.model,
    provider: 'vercel-ai-gateway',
    analysisVersion: cfg.analysisVersion,
  });
});

app.get('/api/runs/:runId/ai-analysis', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  res.json(report.reportFirst?.aiAnalysis ?? { status: 'unavailable' });
});

app.post('/api/runs/:runId/ai-analysis', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const cfg = getAiGatewayConfig();
  if (!cfg.enabled) {
    return res.status(503).json({
      error: 'AI Gateway not configured',
      hint: 'Set AI_GATEWAY_API_KEY or VERCEL_AI_API_KEY in server environment or repo-root .env',
    });
  }
  const force = req.body?.force === true;
  const key = aiAnalysisCacheKey(report);
  const existing = loadAiCache(report.runId);
  if (!force && existing?.cacheKey === key && existing?.analysis) {
    return res.json(existing.analysis);
  }
  try {
    const analysis = await generateAiReportAnalysis(report);
    saveAiCache(report.runId, {
      runId: report.runId,
      cacheKey: key,
      savedAt: new Date().toISOString(),
      analysis,
    });
    res.json(analysis);
  } catch (err) {
    const fail = failedState(err?.message ?? String(err));
    res.status(502).json(fail);
  }
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

app.get('/api/runs/:runId/workspace', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const state = loadWorkspaceState(report.runId);
  res.json(buildWorkspaceBundle(report, state));
});

app.post('/api/runs/:runId/workspace/analyze', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const force = req.body?.force === true;
  if (force) {
    try {
      const analysis = await runAiAnalysisForWorkspace(report, { force: true });
      const bundle = buildWorkspaceBundle(getRun(report.runId), loadWorkspaceState(report.runId));
      return res.json({ analysis, workspace: bundle });
    } catch (e) {
      return res.status(502).json({ error: String(e?.message ?? e) });
    }
  }
  queueAiAnalysis(report.runId, getRun);
  res.status(202).json({ status: 'queued' });
});

app.post('/api/runs/:runId/workspace/repair/plan', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const findingIds = req.body?.findingIds ?? [];
  if (!findingIds.length) return res.status(400).json({ error: 'findingIds required' });
  const result = await createRepairPlan(report, findingIds, { label: req.body?.label });
  res.json(result);
});

app.post('/api/runs/:runId/workspace/repair/:repairId/patch', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  try {
    const result = await generateRepairPatch(report, req.params.repairId, {
      repoRoot: req.body?.repoRoot,
    });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

app.post('/api/runs/:runId/workspace/repair/:repairId/apply', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  try {
    const result = await applyRepairPatch(report.runId, req.params.repairId, {
      repoRoot: req.body?.repoRoot,
    });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

app.post('/api/runs/:runId/workspace/repair/:repairId/verify', async (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  try {
    const result = await verifyRepair(report.runId, req.params.repairId, {
      verifyCommandId: req.body?.verifyCommandId,
    });
    res.json(result);
  } catch (e) {
    res.status(502).json({ error: String(e?.message ?? e) });
  }
});

app.get('/api/runs/:runId/comparable-baselines', (req, res) => {
  const current = loadNormalizedRunBare(req.params.runId);
  if (!current) return res.status(404).json({ error: 'not found' });
  const baselines = listComparableBaselineRuns(current, listRuns(current.appId));
  res.json({ runId: current.runId, baselines });
});

app.get('/api/runs/:runId/comparison', (req, res) => {
  const current = loadNormalizedRunBare(req.params.runId);
  if (!current) return res.status(404).json({ error: 'not found' });
  const baselineRunId =
    req.query.baselineRunId ?? current.meta?.retestOf ?? current.meta?.previousRunId ?? null;
  if (!baselineRunId) {
    return res.json({
      available: false,
      message: 'No baseline run linked. Retest from a prior report or pass baselineRunId.',
    });
  }
  const baseline = loadNormalizedRunBare(baselineRunId);
  if (!baseline) return res.status(404).json({ error: 'baseline not found' });
  const changes = compareRunsDetailed(baseline, current);
  res.json({
    available: true,
    baselineRunId,
    currentRunId: current.runId,
    changes,
  });
});

app.get('/api/runs/:runId/audit.md', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const body = report.qaAudit?.markdown ?? '# Audit unavailable — re-open report after server update\n';
  if (req.query.download === '1') {
    return attachment(res, `qa-audit-${report.runId}.md`, 'text/markdown; charset=utf-8', body);
  }
  res.type('text/markdown; charset=utf-8').send(body);
});

app.get('/api/runs/:runId/audit.html', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  res.type('text/html; charset=utf-8').send(report.qaAudit?.html ?? '<p>Audit unavailable</p>');
});

function attachment(res, filename, contentType, body) {
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.type(contentType).send(body);
}

function ensureExports(req, runId) {
  const report = getRun(runId);
  if (!report) return null;
  persistRunExports(report, resolveModuleHealthApiBase(req));
  return report;
}

app.get('/api/runs/:runId/export.json', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  attachment(res, `module-health-${report.runId}.json`, 'application/json', JSON.stringify(report, null, 2));
});

app.get('/api/runs/:runId/cursor-pack.md', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const body = readExportFile(report.runId, 'cursor-pack.md') ?? buildCursorExportPack(report, resolveModuleHealthApiBase(req));
  attachment(res, `module-health-${report.runId}-cursor-pack.md`, 'text/markdown; charset=utf-8', body);
});

app.get('/api/runs/:runId/exports', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'not found' });
  const id = report.runId;
  res.json({
    runId: id,
    savedDir: `data/exports/${id}`,
    files: {
      reportJson: `/api/runs/${id}/export.json`,
      cursorPack: `/api/runs/${id}/cursor-pack.md`,
      fixPrompt: `/api/runs/${id}/fix-prompt.md`,
      fixAllPrompt: `/api/runs/${id}/fix-all-prompt.md`,
      qaAuditMd: `/api/runs/${id}/audit.md`,
      qaAuditHtml: `/api/runs/${id}/audit.html`,
    },
  });
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

app.post('/api/runs/:runId/gap-analysis-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  res.type('text/plain').send(buildGapAnalysisPrompt(report));
});

app.post('/api/runs/:runId/fix-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const baselineRunId = req.body?.baselineRunId;
  res.type('text/plain').send(buildCursorFixPlanPrompt(report, { baselineRunId }));
});

app.get('/api/runs/:runId/fix-prompt.md', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const body = readExportFile(report.runId, 'fix-prompt.md') ?? buildCursorFixPlanPrompt(report);
  attachment(res, `module-health-${report.runId}-fix-prompt.md`, 'text/markdown; charset=utf-8', body);
});

function repairPromptBody(report, req) {
  const findingIds =
    req.body?.findingIds ??
    (req.query.findingIds ? String(req.query.findingIds).split(',').filter(Boolean) : undefined);
  const label = req.body?.label ?? req.query.label ?? undefined;
  return buildCursorRepairPrompt(report, { findingIds, label });
}

app.post('/api/runs/:runId/repair-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  res.type('text/plain; charset=utf-8').send(repairPromptBody(report, req));
});

app.get('/api/runs/:runId/repair-prompt.md', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const body = repairPromptBody(report, req);
  const suffix = req.query.findingIds ? '-selected' : '';
  attachment(res, `module-health-${report.runId}-repair${suffix}.md`, 'text/markdown; charset=utf-8', body);
});

app.post('/api/runs/:runId/fix-all-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const apiBase =
    req.body?.moduleHealthApiBase?.replace(/\/$/, '') ||
    req.body?.uiOrigin?.replace(/\/$/, '') ||
    resolveModuleHealthApiBase(req);
  res.type('text/plain').send(buildCursorFixAllGapsPrompt(report, { apiBase }));
});

app.get('/api/runs/:runId/fix-all-prompt.md', (req, res) => {
  const report = ensureExports(req, req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const base = resolveModuleHealthApiBase(req);
  const body =
    readExportFile(report.runId, 'fix-all-prompt.md') ??
    buildCursorFixAllGapsPrompt(report, { apiBase: base });
  attachment(res, `module-health-${report.runId}-fix-all-prompt.md`, 'text/markdown; charset=utf-8', body);
});

app.post('/api/runs/:runId/report-analysis-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const body = req.body ?? {};
  const apiBase =
    body.moduleHealthApiBase?.replace(/\/$/, '') ||
    body.uiOrigin?.replace(/\/$/, '') ||
    resolveModuleHealthApiBase(req);
  res.type('text/plain').send(buildReportAnalysisPrompt(report, apiBase));
});

app.post('/api/apps/:appId/comprehensive-audit-prompt', (req, res) => {
  const reg = loadRegistry();
  const app = reg.apps.find((a) => a.id === req.params.appId);
  if (!app) return res.status(404).json({ error: 'app not found' });
  const body = req.body ?? {};
  const apiBase = resolvePromptApiBase(req, body, resolveModuleHealthApiBase);
  const text = buildComprehensiveAuditPrompt({
    app,
    moduleHealthApiBase: apiBase,
    uiOrigin: body.uiOrigin ?? req.get('origin') ?? null,
    environment: body.environment ?? 'production',
    targetUrl: body.targetUrl,
    repoRoot: body.repoRoot,
    priorRunIds: body.priorRunIds ?? [],
    latestReport: body.latestRunId ? getRun(body.latestRunId) : null,
  });
  res.type('text/plain').send(text);
});

app.post('/api/runs/:runId/comprehensive-audit-prompt', (req, res) => {
  const report = getRun(req.params.runId);
  if (!report) return res.status(404).json({ error: 'run not found' });
  const reg = loadRegistry();
  const app = reg.apps.find((a) => a.id === report.appId) ?? {
    id: report.appId,
    name: report.appName,
    environments: [],
    modules: report.modulesInventory ?? [],
  };
  const body = req.body ?? {};
  const apiBase = resolvePromptApiBase(req, body, resolveModuleHealthApiBase);
  const text = buildComprehensiveAuditPrompt({
    app,
    moduleHealthApiBase: apiBase,
    uiOrigin: body.uiOrigin ?? req.get('origin') ?? null,
    environment: report.environment,
    targetUrl: report.meta?.targetUrl,
    repoRoot: report.meta?.repoRoot,
    priorRunIds: [report.runId],
    latestReport: report,
  });
  res.type('text/plain').send(text);
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
