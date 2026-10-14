import fs from 'node:fs';
import path from 'node:path';
import { createFinding } from '../findings.mjs';
import { openBrowserSession, createInstrumentedPage } from '../browser-session.mjs';
import { waitForAppReadiness } from '../readiness.mjs';
import { captureScreenshot } from '../evidence.mjs';

/**
 * @param {object} ctx
 */
export async function runLevel5Resilience(ctx) {
  const { app, environment, targetUrl, budgets, appId, runId, artifactDir } = ctx;
  const env = app.environments?.find((e) => e.id === environment);
  if (environment === 'production' || env?.id === 'production') {
    return [
      createFinding({
        checkId: 'l5.policy.production',
        appId: app.id,
        environment,
        level: 5,
        status: 'blocked',
        severity: 'info',
        title: 'Load/resilience tests blocked on production',
        remediation: { summary: 'Use approved staging with explicit configuration.' },
      }),
    ];
  }

  const findings = [];
  const timeoutMs = budgets?.timeoutMs ?? 45000;
  const recovery = budgets?.recovery ?? {};
  const errorUrl = recovery.errorUrl ?? deriveSiblingUrl(targetUrl, 'error.html');
  const recoveryUrl = recovery.recoveryUrl ?? deriveSiblingUrl(targetUrl, 'index.html');

  if (!errorUrl || !recoveryUrl) {
    findings.push(
      createFinding({
        checkId: 'l5.recovery.config',
        appId,
        environment,
        level: 5,
        status: 'blocked',
        severity: 'info',
        title: 'Recovery recipe URLs not configured',
        actual: 'Set budgets.recovery.errorUrl and recoveryUrl or use defect-fixture base URL.',
      }),
    );
    return findings;
  }

  const { browser, context } = await openBrowserSession();
  const traceEnabled = budgets?.playwrightTrace ?? true;
  const tracePath = path.join(artifactDir ?? path.join(process.cwd(), 'data/artifacts', runId ?? 'run'), 'trace-recovery.zip');

  if (traceEnabled) {
    await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  }

  try {
    const { page, session, navigate } = await createInstrumentedPage(context, null);
    page.setDefaultTimeout(timeoutMs);

    await navigate(errorUrl, timeoutMs);
    const hadError = session.pageErrors.length > 0 || session.consoleErrors.length > 0;
    findings.push(
      createFinding({
        checkId: 'l5.recovery.detect-failure',
        appId,
        environment,
        level: 5,
        status: hadError ? 'pass' : 'fail',
        severity: hadError ? 'info' : 'medium',
        title: 'Failure state observable before recovery',
        expected: 'Error page surfaces console or page error',
        actual: hadError ? 'errors captured' : 'no errors captured',
      }),
    );

    await navigate(recoveryUrl, timeoutMs);
    const readiness = await waitForAppReadiness(page, {
      timeoutMs: Math.min(15_000, timeoutMs),
      selector: app?.readiness?.selector,
    });
    const recoveryFinding = createFinding({
      checkId: 'l5.recovery.restore',
      appId,
      environment,
      level: 5,
      status: readiness.state === 'ready' ? 'pass' : 'fail',
      severity: readiness.state === 'ready' ? 'info' : 'high',
      title: 'Recovery navigation restores ready state',
      expected: 'ready',
      actual: readiness.state,
    });
    if (runId && readiness.state === 'ready') {
      const shot = await captureScreenshot(page, runId, 'recovery-ok');
      recoveryFinding.evidence = [shot];
    }
    findings.push(recoveryFinding);
  } catch (e) {
    findings.push(
      createFinding({
        checkId: 'l5.recovery.crash',
        appId,
        environment,
        level: 5,
        status: 'fail',
        severity: 'high',
        title: 'Recovery recipe failed',
        actual: String(e?.message ?? e),
      }),
    );
  } finally {
    if (traceEnabled) {
      fs.mkdirSync(path.dirname(tracePath), { recursive: true });
      try {
        await context.tracing.stop({ path: tracePath });
        findings.push(
          createFinding({
            checkId: 'l5.trace.artifact',
            appId,
            environment,
            level: 5,
            status: 'pass',
            severity: 'info',
            title: 'Playwright trace captured for recovery flow',
            evidence: [{ type: 'playwright-trace', path: tracePath }],
          }),
        );
      } catch {
        /* ignore */
      }
    }
    await browser.close();
  }

  return findings;
}

function deriveSiblingUrl(base, fileName) {
  if (!base) return null;
  try {
    const u = new URL(base);
    const parts = u.pathname.split('/');
    parts[parts.length - 1] = fileName;
    u.pathname = parts.join('/');
    return u.toString();
  } catch {
    return null;
  }
}
