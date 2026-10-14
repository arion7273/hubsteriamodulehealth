import { runLevel1QuickHealth } from './levels/level1-quick-health.mjs';
import { runLevel2ModuleChecks } from './levels/level2-module.mjs';
import { runLevel3Workflows } from './levels/level3-workflows.mjs';
import { runLevel4Quality } from './levels/level4-quality.mjs';
import { runLevel5Resilience } from './levels/level5-resilience.mjs';
import { mergeWithHistory, summarizeFindings, createFinding } from './findings.mjs';
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
  const allFindings = [];

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
  };

  for (const level of levels) {
    if (level === 1) allFindings.push(...(await runLevel1QuickHealth(baseCtx)));
    if (level === 2) allFindings.push(...(await runLevel2ModuleChecks(baseCtx)));
    if (level === 3) allFindings.push(...(await runLevel3Workflows(baseCtx)));
    if (level === 4) allFindings.push(...(await runLevel4Quality(baseCtx)));
    if (level === 5) allFindings.push(...(await runLevel5Resilience(baseCtx)));
  }

  const merged = mergeWithHistory(allFindings, previousReport?.findings ?? []);
  return buildReport(runRequest, app, merged, { budgets, envConfig });
}

function buildReport(runRequest, app, findings, meta = {}) {
  const counts = summarizeFindings(findings);
  const executed =
    counts.pass + counts.fail + counts.blocked + counts.skip + counts.not_tested + counts.not_applicable;
  const modulesConfigured = (app.modules ?? []).length;
  const modulesCovered = new Set(findings.filter((f) => f.moduleId).map((f) => f.moduleId)).size;

  const passExecuted = counts.pass;
  const failExecuted = counts.fail;
  let headline = meta.blocked
    ? 'Run blocked before execution'
    : failExecuted === 0
      ? `All ${passExecuted} executed checks passed; ${modulesCovered} of ${modulesConfigured} modules referenced in findings.`
      : `${failExecuted} check(s) failed; ${passExecuted} passed of ${executed} executed; ${modulesCovered} of ${modulesConfigured} modules referenced.`;

  const failHigh = findings.filter(
    (f) => f.status === 'fail' && (f.severity === 'blocker' || f.severity === 'high'),
  );

  let gate = 'ship';
  if (meta.blocked || meta.error) gate = 'investigate_blocked';
  else if (failHigh.length) gate = 'fix_blockers';
  else if (counts.fail > 0) gate = 'fix_issues';

  const recommendations = findings
    .filter((f) => f.status === 'fail')
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
    .slice(0, 15)
    .map((f) => ({
      findingId: f.id,
      checkId: f.checkId,
      title: f.title,
      severity: f.severity,
      summary: f.remediation?.summary ?? f.detail ?? f.title,
    }));

  return {
    version: 2,
    runId: runRequest.runId,
    appId: app.id,
    appName: app.name,
    environment: runRequest.environment,
    buildId: runRequest.buildId ?? app.buildId ?? null,
    inputMode: runRequest.inputMode ?? 'url',
    levels: runRequest.levels ?? [1],
    generatedAt: new Date().toISOString(),
    timezone: registryTimezone(),
    gate,
    headline,
    summary: { counts, executed, modulesConfigured, modulesCovered },
    modulesInventory: (app.modules ?? []).map((m) => ({
      ...m,
      coverage: findings.some((f) => f.moduleId === m.id) ? 'referenced' : 'not_in_run',
    })),
    findings,
    recommendations,
    meta,
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
