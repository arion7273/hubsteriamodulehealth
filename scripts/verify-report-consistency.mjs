#!/usr/bin/env node
/**
 * Controlled report fixture + live scan verification for report accuracy.
 */
import assert from 'node:assert/strict';
import { createFinding } from '../engine/findings.mjs';
import { normalizeRunReport } from '../engine/report-normalize.mjs';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry, saveRun, getRun } from '../server/storage.mjs';
import { buildToolInventory } from '../engine/tool-inventory.mjs';
import { ensureLocalServer } from './lib/ensure-local-server.mjs';
import { identifyFromGit } from '../engine/build-identification.mjs';
import { buildRepairPlan } from '../engine/repair-plan.mjs';
import { deriveExecution, formatHeadline } from '../engine/report-execution.mjs';
import { buildCursorRepairPrompt } from '../engine/cursor-repair-prompt.mjs';
import { getFixPlaybook } from '../engine/fix-playbooks.mjs';
import { waitForAppReadiness } from '../engine/readiness.mjs';
import { openBrowserSession, createInstrumentedPage } from '../engine/browser-session.mjs';

function mk(status, i, extra = {}) {
  return createFinding({
    checkId: extra.checkId ?? `fixture.check.${i}`,
    appId: 'adhoc-url-scan',
    environment: 'custom',
    level: 1,
    status,
    severity: extra.severity ?? (status === 'fail' ? 'high' : 'info'),
    title: extra.title ?? `Fixture ${status} #${i}`,
    actual: extra.actual ?? status,
    blockedBy: extra.blockedBy,
    detail: extra.detail,
    evidence: extra.evidence ?? (status === 'fail' ? [{ type: 'text', value: 'fixture evidence' }] : []),
    meta: extra.meta,
  });
}

function buildCanonicalFindings() {
  const findings = [];
  for (let i = 0; i < 9; i++) findings.push(mk('pass', i));
  findings.push(
    mk('fail', 9, { checkId: 'l1.readiness.application', severity: 'high', title: 'App defect high' }),
    mk('fail', 10, { checkId: 'l1.links.broken', severity: 'medium', title: 'Review medium fail' }),
    mk('fail', 11, { checkId: 'eslint.preflight', severity: 'blocker', title: 'Runner ESLint preflight', meta: { tool: 'eslint' } }),
    mk('fail', 12, { checkId: 'playwright.crash', severity: 'blocker', title: 'Playwright runner crashed' }),
  );
  findings.push(
    mk('blocked', 13, {
      checkId: 'l1.links.coverage',
      title: 'Same-origin link crawl',
      blockedBy: 'l1.readiness.application',
      actual: 'Blocked until application readiness passes',
    }),
  );
  for (let i = 0; i < 3; i++) {
    findings.push(
      mk('not_tested', 14 + i, {
        checkId: `l1.deferred.${i}`,
        title: `Deferred check ${i}`,
        detail: 'Prerequisite window exhausted',
      }),
    );
  }
  return findings;
}

function verifyReport(report) {
  const c = report.summary.counts;
  assert.equal(c.pass, 9, 'pass count');
  assert.equal(c.fail, 4, 'fail count');
  assert.equal(c.blocked, 1, 'blocked count');
  assert.equal(c.not_tested, 3, 'not_tested count');

  const s = report.structured.sections;
  assert.equal(s.passing.length, 9, 'passing section');
  assert.equal(s.app_defects.length + s.review.length + s.runner_failures.filter((f) => f.status === 'fail').length, 4, 'fail sections');
  assert.equal(s.blocked.length, 1, 'blocked section');
  assert.equal(s.not_executed.length, 3, 'not executed section');
  assert.equal(report.consistency.ok, true, `consistency: ${report.consistency.issues?.join('; ')}`);

  const failWithEvidence = report.findings.filter((f) => f.status === 'fail');
  assert.equal(failWithEvidence.length, 4);
  for (const f of failWithEvidence) {
    assert.ok(f.evidence?.length || f.actual, `evidence for ${f.checkId}`);
  }

  assert.ok(report.executiveSummary?.items != null, 'executive summary');
  assert.ok(report.coverage?.categories?.length >= 5, 'coverage categories');
  assert.equal(
    report.coverage.categories.find((c) => c.id === 'live-url-health')?.status,
    'executed',
    'L1 coverage category',
  );
}

async function main() {
  const findings = buildCanonicalFindings();
  const raw = {
    version: 2,
    runId: 'run_fixture_canonical_mixed',
    appId: 'adhoc-url-scan',
    appName: 'Quick URL scan',
    environment: 'custom',
    inputMode: 'url',
    levels: [1, 4],
    generatedAt: new Date().toISOString(),
    gate: 'fix_blockers',
    findings,
    meta: {
      targetUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
      finalUrl: 'http://127.0.0.1:4177/fixtures/defect-app/index.html',
      durationMs: 4200,
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
    },
    modulesInventory: [],
  };

  const normalized = normalizeRunReport(raw);
  verifyReport(normalized);
  saveRun(normalized);

  const fromDisk = getRun('run_fixture_canonical_mixed');
  assert.ok(fromDisk.reportFirst?.actionSummary, 'report-first view');
  assert.ok(fromDisk.reportFirst.fixTheseFirst.cards.length >= 1, 'finding cards');
  assert.ok(fromDisk.reportFirst.decision?.recommendation, 'decision block');
  assert.ok(fromDisk.reportFirst.repairPlan?.steps?.length >= 1, 'repair plan');
  const adhocPlan = buildRepairPlan({
    appId: 'adhoc-url-scan',
    inputMode: 'url',
    levels: [1, 4, 5],
    packsExecuted: ['quick-health', 'ui-a11y', 'security', 'load-recovery'],
    findings: [
      mk('fail', 90, { checkId: 'axe.rule.color-contrast', severity: 'high', title: 'Contrast' }),
      mk('fail', 91, { checkId: 'l5.recovery.detect-failure', severity: 'medium', title: 'Recovery' }),
      mk('blocked', 92, { checkId: 'zap.preflight', title: 'ZAP not available' }),
      mk('not_tested', 93, { checkId: 'l3.workflows.none', title: 'No workflows' }),
    ],
  });
  assert.ok(
    adhocPlan.sections.some((s) => s.id === 'application' && s.steps.some((x) => x.checkId?.startsWith('axe.'))),
    'adhoc plan: axe in application',
  );
  assert.ok(
    !adhocPlan.sections.find((s) => s.id === 'application')?.steps.some((x) => x.checkId?.startsWith('l5.')),
    'adhoc plan: l5 recovery not application',
  );
  assert.ok(
    adhocPlan.sections.some((s) => s.id === 'environment'),
    'adhoc plan: environment section',
  );
  assert.ok(
    !adhocPlan.steps.some((s) => s.checkId === 'l3.workflows.none'),
    'adhoc plan: omit workflows.none',
  );

  const blockedHeadline = formatHeadline(
    deriveExecution([
      mk('pass', 200),
      mk('blocked', 201, { checkId: 'l1.links.coverage', title: 'links' }),
    ]),
    0,
    0,
    {},
  );
  assert.match(blockedHeadline, /not fully tested/i);
  assert.doesNotMatch(blockedHeadline, /^All \d+ completed check\(s\) passed\./);

  const crashFinding = mk('fail', 94, {
    checkId: 'playwright-live.crash',
    severity: 'blocker',
    title: 'Playwright runner crashed',
    actual: "browserType.launch: Executable doesn't exist — run npx playwright install",
  });
  const axeCrash = mk('fail', 95, {
    checkId: 'axe-core.crash',
    severity: 'blocker',
    title: 'axe runner crashed',
    actual: "Executable doesn't exist",
  });
  const runnerPrompt = buildCursorRepairPrompt({
    appId: 'adhoc-url-scan',
    inputMode: 'url',
    findings: [crashFinding, axeCrash],
    meta: { targetUrl: 'https://hubsteriacare.com' },
  }, { findingIds: [crashFinding.id, axeCrash.id] });
  assert.match(runnerPrompt, /Scanner host issue/i);
  assert.match(runnerPrompt, /npx playwright install chromium/i);
  assert.doesNotMatch(runnerPrompt, /Fix \*\*root causes\*\* where confirmed/);
  const pwPlaybook = getFixPlaybook(crashFinding);
  assert.match(pwPlaybook.steps.join(' '), /playwright install chromium/i);
  assert.match(pwPlaybook.likelyFiles.join(' '), /Not applicable/i);

  verifyReport(fromDisk);

  const gitSelf = identifyFromGit(process.cwd());
  assert.ok(gitSelf?.buildId, 'module health repo git build id for self-identification');

  const registry = loadRegistry();
  const app = registry.apps.find((a) => a.id === 'defect-fixture');
  const { port, child: serverChild } = await ensureLocalServer(Number(process.env.PORT) || 4177);
  const iframeShellUrl = `http://127.0.0.1:${port}/fixtures/iframe-shell/index.html`;
  const { browser: iframeBrowser, context: iframeCtx } = await openBrowserSession();
  const { page: iframePage, navigate: navIframe } = await createInstrumentedPage(iframeCtx, `http://127.0.0.1:${port}`);
  await navIframe(iframeShellUrl, 20_000);
  const iframeReady = await waitForAppReadiness(iframePage, { timeoutMs: 12_000 });
  await iframeBrowser.close();
  assert.equal(iframeReady.state, 'ready', `iframe-shell readiness: ${iframeReady.state}`);
  assert.ok(iframeReady.innerTextLen > 0 || iframeReady.visibleLinks > 0, 'iframe-shell content detected');

  const targetUrl = `http://127.0.0.1:${port}/fixtures/defect-app/index.html`;

  const live = await executeRun(
    {
      runId: `run_verify_${Date.now()}`,
      appId: 'defect-fixture',
      environment: 'local',
      inputMode: 'url',
      levels: [1],
      targetUrl,
    },
    registry,
    null,
  );

  assert.ok(live.structured?.sections, 'live structured sections');
  assert.ok(live.meta?.targetUrl, 'live targetUrl');
  assert.ok(live.meta?.durationMs != null, 'live duration');
  assert.equal(live.summary.moduleCoverageNote?.includes('not configured') || live.summary.modulesConfigured > 0, true);
  assert.ok(live.toolInventory?.length >= 10, 'tool inventory rows');

  const pw = live.toolInventory.find((t) => t.tool === 'Playwright');
  assert.ok(pw?.executed, 'Playwright executed on URL L1 scan');
  const eslint = live.toolInventory.find((t) => t.tool === 'ESLint');
  assert.equal(eslint?.executed, false, 'ESLint not executed on URL-only');
  assert.match(eslint?.executedReason ?? '', /repository|URL-only/i);

  assert.ok(live.coverage?.honestyNote, 'narrow L1 run honesty note');
  assert.ok(live.coverage.recommended?.packs?.length >= 1, 'recommended broader packs');
  assert.equal(
    live.coverage.categories.find((c) => c.id === 'code-quality')?.status,
    'not_run',
    'code-quality not run on URL L1',
  );
  assert.equal(live.consistency?.ok, true, `live consistency: ${live.consistency?.issues?.join('; ')}`);
  assert.ok(live.executiveSummary?.itemCount >= 0, 'live executive summary');

  saveRun(live);

  assert.ok(live.meta?.buildIdentification || live.buildId, 'live run captured build identification when available');

  const inventory = await buildToolInventory(live, { preflight: false });
  if (serverChild) serverChild.kill('SIGTERM');

  console.log(JSON.stringify({ ok: true, fixture: fromDisk.summary, live: { runId: live.runId, summary: live.summary, toolInventory: inventory } }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
