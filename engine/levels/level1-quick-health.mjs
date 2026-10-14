import { createFinding } from '../findings.mjs';
import { originFromUrl } from '../security/url-guard.mjs';
import { openBrowserSession, createInstrumentedPage, setHtmlContent } from '../browser-session.mjs';
import { waitForAppReadiness } from '../readiness.mjs';
import { captureScreenshot, captureSanitizedDom } from '../evidence.mjs';
import { applyPrerequisites } from '../prerequisites.mjs';

function blockedDependent(findings, reason) {
  return applyPrerequisites(findings, 'l1.readiness.application', 'l1.links.');
}

/**
 * @param {object} ctx
 */
export async function runLevel1QuickHealth(ctx) {
  const findings = [];
  const {
    targetUrl,
    budgets,
    appId,
    environment,
    inputMode,
    htmlSnapshot,
    app,
    runId,
  } = ctx;
  const pageLimit = budgets?.pageLimit ?? 15;
  const timeoutMs = budgets?.timeoutMs ?? 45000;
  const readinessTimeout =
    app?.readiness?.timeoutMs ?? budgets?.readinessTimeoutMs ?? Math.min(20_000, Math.floor(timeoutMs / 2));
  const readinessSelector = app?.readiness?.selector ?? ctx.moduleSettings?.readinessSelector;

  const scopeNote =
    inputMode === 'html'
      ? 'HTML snapshot: layout/links/a11y on snapshot only; backend/auth/persistence not verified.'
      : 'Live URL: browser-rendered assertions during initial navigation and readiness window.';

  findings.push(
    createFinding({
      checkId: 'l1.scope.disclosure',
      appId,
      environment,
      level: 1,
      category: 'metadata',
      status: 'pass',
      severity: 'info',
      title: 'Test scope disclosed',
      actual: scopeNote,
    }),
  );

  const { browser, context } = await openBrowserSession();
  const baseOrigin = targetUrl ? originFromUrl(targetUrl) : null;
  const { page, session, navigate } = await createInstrumentedPage(context, baseOrigin);
  page.setDefaultTimeout(timeoutMs);

  let readiness = null;
  let evidence = [];

  try {
    if (inputMode === 'html') {
      if (!htmlSnapshot?.html) {
        findings.push(
          createFinding({
            checkId: 'l1.html.missing',
            appId,
            environment,
            level: 1,
            status: 'blocked',
            severity: 'high',
            title: 'HTML input missing content',
          }),
        );
        return findings;
      }
      await setHtmlContent(page, session, htmlSnapshot.html, timeoutMs);
      readiness = await waitForAppReadiness(page, { timeoutMs: readinessTimeout, selector: readinessSelector });
    } else {
      let response;
      try {
        response = await navigate(targetUrl, timeoutMs);
      } catch (e) {
        findings.push(
          createFinding({
            checkId: 'l1.navigation.outcome',
            appId,
            environment,
            level: 1,
            route: targetUrl,
            status: 'fail',
            severity: 'blocker',
            title: 'Navigation failed',
            actual: String(e?.message ?? e),
            expected: 'Successful navigation',
          }),
        );
        return findings;
      }

      findings.push(
        createFinding({
          checkId: 'l1.navigation.outcome',
          appId,
          environment,
          level: 1,
          category: 'metadata',
          status: 'pass',
          severity: 'info',
          title: 'Navigation completed',
          actual: `outcome=${session.navigationOutcome}, finalUrl=${session.finalUrl}`,
          evidence: [{ type: 'nav', initialUrl: session.initialUrl, finalUrl: session.finalUrl, redirects: session.redirectChain }],
        }),
      );

      const status = response?.status() ?? session.httpStatus;
      findings.push(
        createFinding({
          checkId: 'l1.reachability.http-status',
          appId,
          environment,
          level: 1,
          category: 'metadata',
          status: status && status < 400 ? 'pass' : 'fail',
          severity: status && status < 400 ? 'info' : 'blocker',
          title: 'HTTP status on entry navigation',
          expected: '2xx or 3xx on initial response',
          actual: String(status),
          detail: 'HTTP status alone does not establish application readiness.',
        }),
      );

      if (session.initialUrl !== session.finalUrl) {
        const loginRedirect = /login|signin|auth/i.test(session.finalUrl);
        findings.push(
          createFinding({
            checkId: 'l1.navigation.redirect',
            appId,
            environment,
            level: 1,
            status: loginRedirect ? 'fail' : 'pass',
            severity: loginRedirect ? 'high' : 'info',
            title: loginRedirect ? 'Unexpected login redirect' : 'Entry URL redirected',
            actual: `${session.initialUrl} → ${session.finalUrl}`,
            expected: loginRedirect ? 'Stay on requested route or explicit auth policy' : 'Document redirect',
          }),
        );
      }

      readiness = await waitForAppReadiness(page, {
        timeoutMs: readinessTimeout,
        selector: readinessSelector,
      });
    }

    const title = await page.title();
    findings.push(
      createFinding({
        checkId: 'l1.content.title',
        appId,
        environment,
        level: 1,
        category: 'metadata',
        status: title ? 'pass' : 'fail',
        severity: 'low',
        title: 'Document title present',
        actual: title || '(empty)',
        detail: 'Title metadata is not proof of rendered app readiness.',
      }),
    );

    const readinessStatus =
      readiness.ready ? 'pass' : readiness.state === 'login_required' || readiness.state === 'access_denied' ? 'fail' : 'blocked';

    if (!readiness.ready && runId) {
      try {
        evidence.push(await captureScreenshot(page, runId, 'readiness-failed'));
        evidence.push(await captureSanitizedDom(page, runId, 'readiness-failed'));
      } catch {
        /* evidence optional */
      }
    }

    findings.push(
      createFinding({
        checkId: 'l1.readiness.application',
        appId,
        environment,
        level: 1,
        status: readinessStatus,
        severity: readiness.ready ? 'info' : 'high',
        title: 'Application readiness (rendered page)',
        expected: 'Visible content, landmark, or configured readiness selector',
        actual: `state=${readiness.state}, waitedMs=${readiness.waitedMs}, method=${readiness.method}, innerTextLen=${readiness.innerTextLen}, visibleLinks=${readiness.visibleLinks}`,
        detail: `instrumentationComplete=${session.instrumentationComplete}, observationWindow=${session.observationWindow}`,
        evidence,
        remediation: readiness.ready
          ? null
          : {
              summary: stateRemediation(readiness.state),
            },
        userImpact: readiness.ready ? null : 'Users may not see a working screen at this URL.',
        acceptanceCriteria: 'Re-run Level 1; l1.readiness.application passes with state=ready.',
      }),
    );

    const windowLabel = session.observationWindow;
    if (session.pageErrors.length) {
      for (const msg of session.pageErrors.slice(0, 5)) {
        findings.push(
          createFinding({
            checkId: 'l1.js.uncaught-error',
            appId,
            environment,
            level: 1,
            status: 'fail',
            severity: 'high',
            title: 'Uncaught JavaScript error during observation window',
            actual: msg,
            detail: `No uncaught errors observed during ${windowLabel} (not a guarantee for the entire app).`,
          }),
        );
      }
    } else {
      findings.push(
        createFinding({
          checkId: 'l1.js.uncaught-error',
          appId,
          environment,
          level: 1,
          status: 'pass',
          severity: 'info',
          title: 'No uncaught JavaScript errors during observation window',
          actual: `window=${windowLabel}`,
        }),
      );
    }

    if (session.failedFirstParty.length) {
      for (const fr of session.failedFirstParty.slice(0, 8)) {
        findings.push(
          createFinding({
            checkId: 'l1.network.first-party-failed',
            appId,
            environment,
            level: 1,
            status: 'fail',
            severity: 'high',
            title: 'Failed first-party request during observation window',
            actual: `${fr.url} (${fr.error})`,
            detail: `Observed during ${windowLabel}; not a claim of global network health.`,
          }),
        );
      }
    } else {
      findings.push(
        createFinding({
          checkId: 'l1.network.first-party-failed',
          appId,
          environment,
          level: 1,
          status: 'pass',
          severity: 'info',
          title: 'No failed first-party requests during observation window',
          actual: `window=${windowLabel}`,
        }),
      );
    }

    if (session.failedExternal.length) {
      findings.push(
        createFinding({
          checkId: 'l1.network.external-failures',
          appId,
          environment,
          level: 1,
          status: 'pass',
          severity: 'info',
          title: 'External request failures noted separately',
          actual: `${session.failedExternal.length} external failure(s) during ${windowLabel}`,
        }),
      );
    }

    // Link crawl only if readiness passed
    if (readiness.ready && inputMode !== 'html') {
      const links = await page.locator('a[href]').evaluateAll((els) =>
        els.map((a) => ({
          href: a.getAttribute('href'),
          text: (a.textContent || '').trim().slice(0, 80),
          visible: a.offsetParent !== null,
        })),
      );
      const base = new URL(session.finalUrl || targetUrl);
      let checked = 0;
      let sameOriginCount = 0;
      for (const link of links) {
        if (!link.visible) continue;
        if (!link.href || link.href.startsWith('#') || link.href.startsWith('mailto:')) continue;
        let abs;
        try {
          abs = new URL(link.href, base).href;
        } catch {
          continue;
        }
        if (originFromUrl(abs) !== originFromUrl(base.href)) continue;
        sameOriginCount++;
        if (checked >= pageLimit) continue;
        checked++;
        try {
          const resp = await page.request.get(abs, { timeout: Math.min(15_000, timeoutMs) });
          if (resp.status() >= 400) {
            findings.push(
              createFinding({
                checkId: 'l1.links.broken',
                appId,
                environment,
                level: 1,
                route: abs,
                status: 'fail',
                severity: 'medium',
                title: 'Broken same-origin link',
                actual: `HTTP ${resp.status()} for "${link.text}"`,
              }),
            );
          }
        } catch (e) {
          findings.push(
            createFinding({
              checkId: 'l1.links.broken',
              appId,
              environment,
              level: 1,
              status: 'fail',
              severity: 'medium',
              title: 'Link request failed',
              actual: String(e?.message ?? e),
            }),
          );
        }
      }
      findings.push(
        createFinding({
          checkId: 'l1.links.coverage',
          appId,
          environment,
          level: 1,
          status: sameOriginCount === 0 ? 'not_applicable' : 'pass',
          severity: 'info',
          title: 'Same-origin link crawl',
          actual:
            sameOriginCount === 0
              ? 'No visible same-origin links (SPA/router apps often have none in static HTML)'
              : `checked ${checked} of ${sameOriginCount} visible same-origin link(s)`,
        }),
      );
    } else if (!readiness.ready) {
      findings.push(
        createFinding({
          checkId: 'l1.links.coverage',
          appId,
          environment,
          level: 1,
          status: 'blocked',
          severity: 'info',
          title: 'Same-origin link crawl',
          blockedBy: 'l1.readiness.application',
          actual: 'Blocked until application readiness passes',
        }),
      );
    }
  } finally {
    if (ctx.runMeta && session?.finalUrl) {
      ctx.runMeta.finalUrl = session.finalUrl;
    }
    await browser.close();
  }

  return blockedDependent(findings);
}

function stateRemediation(state) {
  const map = {
    login_required: 'Configure authenticated test access or use a public entry URL.',
    access_denied: 'Verify role and tenant for this URL.',
    bot_challenge: 'Headless browser may be blocked; use approved test environment or allowlist.',
    blank_screen: 'Client shell without visible content — check bundle errors or auth gate.',
    loading: 'Increase readiness timeout or set app.readiness.selector in registry.',
  };
  return map[state] ?? 'Investigate rendered page state with captured screenshot/DOM evidence.';
}
