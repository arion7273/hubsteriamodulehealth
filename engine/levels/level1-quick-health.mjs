import { chromium } from 'playwright';
import { createFinding } from '../findings.mjs';
import { originFromUrl } from '../security/url-guard.mjs';

/**
 * @param {object} ctx
 */
export async function runLevel1QuickHealth(ctx) {
  const findings = [];
  const { targetUrl, budgets, appId, environment, inputMode, htmlSnapshot } = ctx;
  const pageLimit = budgets?.pageLimit ?? 15;
  const timeoutMs = budgets?.timeoutMs ?? 45000;

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
  });

  const jsErrors = [];
  const failedRequests = [];
  const externalFailures = [];

  context.on('page', (page) => {
    page.on('pageerror', (err) => jsErrors.push(String(err.message || err)));
    page.on('requestfailed', (req) => {
      const url = req.url();
      const failure = { url, error: req.failure()?.errorText };
      try {
        const reqOrigin = originFromUrl(url);
        const baseOrigin = targetUrl ? originFromUrl(targetUrl) : null;
        if (baseOrigin && reqOrigin === baseOrigin) failedRequests.push(failure);
        else externalFailures.push(failure);
      } catch {
        externalFailures.push(failure);
      }
    });
  });

  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);

  const scopeNote =
    inputMode === 'html'
      ? 'HTML snapshot: layout/links/JS only; backend/auth/persistence not verified.'
      : 'Live URL: first-party network and navigation checks apply.';

  findings.push(
    createFinding({
      checkId: 'l1.scope.disclosure',
      appId,
      environment,
      level: 1,
      status: 'pass',
      severity: 'info',
      title: 'Test scope disclosed',
      actual: scopeNote,
      expected: 'Honest scope labeling',
    }),
  );

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
            userImpact: 'Cannot run layout checks without HTML body.',
            remediation: { summary: 'Paste or upload HTML for snapshot mode.' },
          }),
        );
        await browser.close();
        return findings;
      }
      await page.setContent(htmlSnapshot.html, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } else {
      const response = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      if (!response) {
        findings.push(
          createFinding({
            checkId: 'l1.reachability.response',
            appId,
            environment,
            level: 1,
            route: targetUrl,
            status: 'fail',
            severity: 'blocker',
            title: 'No response from navigation',
            expected: 'HTTP response received',
            actual: 'Navigation returned null response',
            reproduction: [`Open ${targetUrl}`],
          }),
        );
      } else {
        const status = response.status();
        findings.push(
          createFinding({
            checkId: 'l1.reachability.http-status',
            appId,
            environment,
            route: targetUrl,
            level: 1,
            status: status >= 400 ? 'fail' : 'pass',
            severity: status >= 400 ? 'blocker' : 'info',
            title: 'HTTP status on entry URL',
            expected: '2xx or 3xx',
            actual: String(status),
          }),
        );
        if (status >= 300 && status < 400) {
          findings.push(
            createFinding({
              checkId: 'l1.redirect.entry',
              appId,
              environment,
              level: 1,
              status: 'pass',
              severity: 'info',
              title: 'Entry URL redirected',
              actual: response.headers()['location'] ?? 'redirect',
            }),
          );
        }
      }
    }

    const title = await page.title();
    const bodyText = (await page.locator('body').innerText().catch(() => '')).trim();
    findings.push(
      createFinding({
        checkId: 'l1.content.title',
        appId,
        environment,
        level: 1,
        status: title ? 'pass' : 'fail',
        severity: title ? 'low' : 'medium',
        title: 'Document title present',
        expected: 'Non-empty <title>',
        actual: title || '(empty)',
      }),
    );
    findings.push(
      createFinding({
        checkId: 'l1.content.blank-screen',
        appId,
        environment,
        level: 1,
        status: bodyText.length > 0 ? 'pass' : 'fail',
        severity: bodyText.length > 0 ? 'info' : 'high',
        title: 'Page has visible text content',
        expected: 'Body text length > 0',
        actual: `length=${bodyText.length}`,
      }),
    );

    if (jsErrors.length) {
      for (const msg of jsErrors.slice(0, 5)) {
        findings.push(
          createFinding({
            checkId: 'l1.js.uncaught-error',
            appId,
            environment,
            level: 1,
            status: 'fail',
            severity: 'high',
            title: 'Uncaught JavaScript error',
            actual: msg,
            expected: 'No uncaught errors on load',
            reproduction: ['Load entry URL and observe console/page errors'],
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
          title: 'No uncaught JavaScript errors on load',
        }),
      );
    }

    if (failedRequests.length) {
      for (const fr of failedRequests.slice(0, 10)) {
        findings.push(
          createFinding({
            checkId: 'l1.network.first-party-failed',
            appId,
            environment,
            level: 1,
            status: 'fail',
            severity: 'high',
            title: 'Failed first-party request',
            actual: `${fr.url} (${fr.error})`,
            expected: 'First-party assets load successfully',
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
          title: 'No failed first-party requests on load',
        }),
      );
    }

    if (externalFailures.length) {
      findings.push(
        createFinding({
          checkId: 'l1.network.external-failures',
          appId,
          environment,
          level: 1,
          status: 'pass',
          severity: 'info',
          title: 'External service failures noted separately',
          actual: `${externalFailures.length} external failure(s) (not counted as app defects)`,
        }),
      );
    }

    const links = await page.locator('a[href]').evaluateAll((els) =>
      els.map((a) => ({ href: a.getAttribute('href'), text: (a.textContent || '').trim().slice(0, 80) })),
    );
    const base = targetUrl ? new URL(targetUrl) : null;
    let checked = 0;
    for (const link of links) {
      if (checked >= pageLimit) break;
      if (!link.href || link.href.startsWith('#') || link.href.startsWith('mailto:')) continue;
      let abs;
      try {
        abs = base ? new URL(link.href, base).href : link.href;
      } catch {
        continue;
      }
      if (base && originFromUrl(abs) !== originFromUrl(base.href)) continue;
      checked++;
      try {
        const resp = await page.request.get(abs, { timeout: Math.min(15000, timeoutMs) });
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
              expected: '2xx/3xx',
              actual: `HTTP ${resp.status()} for "${link.text}"`,
              reproduction: [`Click link: ${link.text}`, `URL: ${abs}`],
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
            route: abs,
            status: 'fail',
            severity: 'medium',
            title: 'Link request failed',
            actual: String(e?.message ?? e),
          }),
        );
      }
    }
    if (checked === 0) {
      findings.push(
        createFinding({
          checkId: 'l1.links.coverage',
          appId,
          environment,
          level: 1,
          status: inputMode === 'html' ? 'pass' : 'not_tested',
          severity: 'info',
          title: 'Same-origin link crawl',
          actual: 'No same-origin links to check',
        }),
      );
    }
  } finally {
    await browser.close();
  }

  return findings;
}
