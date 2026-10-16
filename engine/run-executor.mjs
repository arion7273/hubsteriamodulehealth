import { executePacks } from './packs/executor.mjs';
import { PACK_DEFINITIONS, validatePacksForInput } from './packs/definitions.mjs';
import { runLevel1QuickHealth } from './levels/level1-quick-health.mjs';
import { runLevel2ModuleChecks } from './levels/level2-module.mjs';
import { runLevel3Workflows } from './levels/level3-workflows.mjs';
import { runLevel4Quality } from './levels/level4-quality.mjs';
import { runLevel5Resilience } from './levels/level5-resilience.mjs';
import { mergeWithHistory, summarizeFindings, createFinding, dedupeFindings } from './findings.mjs';
import { structureReport } from './report-structure.mjs';
import { deriveExecution, formatHeadline } from './report-execution.mjs';
import { expandRetestCheckIds, mergeRetestFindings } from './retest-merge.mjs';
import { attachToolInventory, normalizeRunReport } from './report-normalize.mjs';
import { buildRunCoverage, inferPacksFromLevels } from './run-coverage.mjs';
import { identifyBuild } from './build-identification.mjs';
import { assertUrlAllowed } from './security/url-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {object} runRequest
 * @param {object} registry
 * @param {object} [previousReport]
 */
export async function executeRun(runRequest, registry, previousReport) {
  const app = registry.apps.find((a) => a.id === runRequest.appId);
  if (!app) throw new Error('Unknown app');

  const envConfig = app.environments?.find((e) => e.id === runRequest.environment);
  const global = registry.global ?? {};
  const moduleSettings = runRequest.moduleSettings ?? app.moduleTesterSettings ?? {};

  let targetUrl = runRequest.targetUrl ?? envConfig?.baseUrl ?? app.baseUrl;
  const inputMode = runRequest.inputMode ?? 'url';

  if (inputMode === 'repository' && !(runRequest.repoRoot ?? app.repositoryPath)) {
    const blockedFinding = createFinding({
      checkId: 'run.repo.missing',
      appId: app.id,
      environment: runRequest.environment,
      level: 1,
      status: 'blocked',
      severity: 'high',
      title: 'No repository path configured',
      remediation: { summary: 'Set repositoryPath on the app or pass repoRoot for repository input mode.' },
    });
    return buildReport(runRequest, app, [blockedFinding], {
      error: 'No repository path configured',
      blocked: true,
    });
  }

  if (inputMode === 'url' && !targetUrl && !runRequest.htmlSnapshot) {
    const blockedFinding = createFinding({
      checkId: 'run.target.missing',
      appId: app.id,
      environment: runRequest.environment,
      level: 1,
      status: 'blocked',
      severity: 'high',
      title: 'No target URL configured',
      remediation: { summary: 'Set environment baseUrl or pass targetUrl for this run.' },
    });
    return buildReport(runRequest, app, [blockedFinding], {
      error: 'No target URL configured for this environment',
      blocked: true,
    });
  }

  if (inputMode === 'url' && targetUrl) {
    const authorized = (app.environments ?? []).map((e) => e.baseUrl).filter(Boolean);
    if (runRequest.targetUrl) authorized.push(runRequest.targetUrl);
    await assertUrlAllowed(targetUrl, {
      localRunnerEnabled: global.localRunnerEnabled,
      allowedLocalHosts: global.allowedLocalHosts ?? ['localhost', '127.0.0.1'],
      authorizedOrigins: authorized,
    });
  }

  const budgets = {
    ...global,
    ...app.budgets,
    ...moduleSettings.budgets,
    pageLimit: runRequest.pageLimit ?? moduleSettings.pageLimit ?? app.budgets?.pageLimit ?? global.defaultPageLimit,
    timeoutMs: runRequest.timeoutMs ?? moduleSettings.timeoutMs ?? app.budgets?.timeoutMs ?? global.defaultTimeoutMs,
  };

  const levels = runRequest.levels ?? [1];
  const packs = runRequest.packs?.length ? runRequest.packs : null;
  const allFindings = [];
  const runStarted = Date.now();
  const runStartedAt = new Date(runStarted).toISOString();
  let toolRuns = [];
  const runMeta = { finalUrl: null };

  const repoRoot = runRequest.repoRoot ?? app.repositoryPath ?? null;
  if (repoRoot) {
    const abs = path.isAbsolute(repoRoot) ? repoRoot : path.resolve(repoRoot);
    if (!fs.existsSync(abs)) {
      return buildReport(
        runRequest,
        app,
        [
          createFinding({
            checkId: 'repo.path.missing',
            appId: app.id,
            environment: runRequest.environment,
            status: 'blocked',
            severity: 'high',
            title: 'Repository path not found',
            actual: abs,
          }),
        ],
        { blocked: true, durationMs: Date.now() - runStarted },
      );
    }
  }

  const baseCtx = {
    app,
    appId: app.id,
    environment: runRequest.environment,
    targetUrl,
    inputMode,
    htmlSnapshot: runRequest.htmlSnapshot,
    budgets,
    moduleIds: runRequest.moduleIds,
    workflowIds: runRequest.workflowIds,
    workflowVariant: runRequest.workflowVariant,
    runId: runRequest.runId,
    moduleSettings,
    retestOf: runRequest.retestOf,
    repoRoot: repoRoot ? (path.isAbsolute(repoRoot) ? repoRoot : path.resolve(repoRoot)) : null,
    buildId: runRequest.buildId ?? app.buildId ?? null,
    runMeta,
  };

  if (packs?.length) {
    const invalid = validatePacksForInput(packs, inputMode);
    if (invalid.length) {
      allFindings.push(
        createFinding({
          checkId: 'packs.input.invalid',
          appId: app.id,
          environment: runRequest.environment,
          status: 'blocked',
          severity: 'high',
          title: 'Pack not available for input mode',
          actual: `${invalid.join(', ')} cannot run in ${inputMode} mode`,
          detail: 'HTML/URL mode does not execute repository tools as live coverage.',
        }),
      );
    } else {
      const packResult = await executePacks(baseCtx, packs);
      allFindings.push(...packResult.findings);
      toolRuns = packResult.toolRuns;
    }
  }

  for (const level of levels) {
    if (packs?.length) continue; // legacy levels skipped when packs explicit
    if (level === 1) allFindings.push(...(await runLevel1QuickHealth(baseCtx)));
    if (level === 2) allFindings.push(...(await runLevel2ModuleChecks(baseCtx)));
    if (level === 3) allFindings.push(...(await runLevel3Workflows(baseCtx)));
    if (level === 4) allFindings.push(...(await runLevel4Quality(baseCtx)));
    if (level === 5) allFindings.push(...(await runLevel5Resilience(baseCtx)));
  }

  const deduped = dedupeFindings(allFindings);
  let merged = mergeWithHistory(deduped, previousReport?.findings ?? []);

  const retestPrior = runRequest.retestPriorReport ?? null;
  if (runRequest.retestOf && runRequest.checkFilter?.length && retestPrior?.findings?.length) {
    const retestIds = expandRetestCheckIds(runRequest.checkFilter);
    merged = mergeRetestFindings(retestPrior.findings, merged, retestIds);
  }

  const durationMs = Date.now() - runStarted;
  const buildIdentification =
    runMeta.buildIdentification ??
    (await identifyBuild({
      repoRoot: baseCtx.repoRoot,
      explicitBuildId: runRequest.buildId ?? app.buildId ?? null,
    }));
  const draft = buildReport(runRequest, app, merged, {
    budgets,
    envConfig,
    durationMs,
    startedAt: runStartedAt,
    endedAt: new Date().toISOString(),
    targetUrl,
    repoRoot: baseCtx.repoRoot,
    finalUrl: runMeta.finalUrl,
    previousRunId: previousReport?.runId,
    retestOf: runRequest.retestOf ?? null,
    retestMode: runRequest.retestMode ?? null,
    toolRuns,
    packsExecuted: packs ?? inferPacksFromLevels(levels),
    buildIdentification,
    packDefinitions: PACK_DEFINITIONS,
    artifactDir: `data/artifacts/${runRequest.runId}`,
    workflowVariant: runRequest.workflowVariant ?? null,
    workflowIds: runRequest.workflowIds ?? null,
    runScope: {
      levels,
      inputMode,
      packs: packs ?? [],
      environment: runRequest.environment,
      checkFilter: runRequest.checkFilter ?? null,
      workflowVariant: runRequest.workflowVariant ?? null,
      workflowIds: runRequest.workflowIds ?? null,
    },
  });

  const withTools = await attachToolInventory(draft, baseCtx);
  const coverage = buildRunCoverage(app, runRequest, withTools.toolInventory);
  return normalizeRunReport({ ...withTools, coverage });
}

function buildReport(runRequest, app, findings, meta = {}) {
  const execution = deriveExecution(findings);
  const counts = execution.counts;
  const modulesConfigured = (app.modules ?? []).length;
  const modulesCovered = new Set(findings.filter((f) => f.moduleId).map((f) => f.moduleId)).size;

  const levels = runRequest.levels ?? [1];
  const moduleRoutesNotExercised =
    modulesConfigured > 0 && modulesCovered === 0 && levels.length === 1 && levels[0] === 1;

  const headline = formatHeadline(execution, modulesConfigured, modulesCovered, {
    runBlocked: meta.blocked,
    moduleRoutesNotExercised,
  });

  const failHigh = findings.filter(
    (f) => f.status === 'fail' && (f.severity === 'blocker' || f.severity === 'high'),
  );

  const structured = structureReport(findings);
  const readinessFail = findings.find((f) => f.checkId === 'l1.readiness.application' && f.status !== 'pass');

  let gate = 'ship';
  if (meta.blocked || meta.error) gate = 'investigate_blocked';
  else if (failHigh.length || readinessFail) gate = 'fix_blockers';
  else if (counts.fail > 0) gate = 'fix_issues';

  const recommendations = structured.topFixes;

  return {
    version: 2,
    reportSchemaVersion: 3,
    runId: runRequest.runId,
    appId: app.id,
    appName: app.name,
    environment: runRequest.environment,
    buildId: runRequest.buildId ?? app.buildId ?? meta.buildIdentification?.buildId ?? null,
    inputMode: runRequest.inputMode ?? 'url',
    levels: runRequest.levels ?? [1],
    generatedAt: new Date().toISOString(),
    timezone: registryTimezone(),
    gate,
    headline,
    summary: {
      counts,
      execution: {
        planned: execution.planned,
        completed: execution.completed,
        blocked: execution.blocked,
        notExecuted: execution.notExecuted,
        notApplicable: execution.notApplicable,
      },
      modulesConfigured,
      modulesCovered,
      moduleCoverageNote:
        modulesConfigured === 0
          ? 'Module coverage not configured for this app.'
          : moduleRoutesNotExercised
            ? `${modulesConfigured} module(s) registered; this run did not exercise module routes (typical for Level 1 URL-only). See coverage section.`
            : `${modulesCovered} of ${modulesConfigured} module(s) referenced in findings.`,
    },
    tools: meta.toolRuns ?? [],
    packsExecuted: meta.packsExecuted ?? [],
    modulesInventory: (app.modules ?? []).map((m) => ({
      ...m,
      coverage: findings.some((f) => f.moduleId === m.id) ? 'referenced' : 'not_in_run',
    })),
    findings,
    structured,
    recommendations,
    meta: {
      budgets: meta.budgets,
      envConfig: meta.envConfig,
      role: meta.role ?? null,
      targetUrl: meta.targetUrl ?? null,
      repoRoot: meta.repoRoot ?? runRequest.repoRoot ?? app.repositoryPath ?? null,
      finalUrl: meta.finalUrl ?? null,
      durationMs: meta.durationMs ?? null,
      startedAt: meta.startedAt ?? null,
      endedAt: meta.endedAt ?? null,
      previousRunId: meta.previousRunId ?? null,
      retestOf: meta.retestOf ?? null,
      retestMode: meta.retestMode ?? null,
      artifactDir: meta.artifactDir ?? null,
      runScope: meta.runScope ?? null,
      workflowVariant: meta.workflowVariant ?? runRequest.workflowVariant ?? null,
      workflowIds: meta.workflowIds ?? runRequest.workflowIds ?? null,
      incomplete: meta.incomplete ?? false,
      buildIdentification: meta.buildIdentification ?? null,
    },
    comparisonNote:
      'Blocked, skipped, and not_tested checks are not counted as passes. Compare only equivalent environment and level sets.',
  };
}

function registryTimezone() {
  try {
    const p = path.join(__dirname, '../registry/apps.json');
    const reg = JSON.parse(fs.readFileSync(p, 'utf8'));
    return reg.global?.timezone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

function severityRank(s) {
  return { blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[s] ?? 5;
}
