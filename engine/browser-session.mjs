import { chromium } from 'playwright';
import { originFromUrl } from './security/url-guard.mjs';

/**
 * Real browser session with listeners attached before navigation.
 */
export async function openBrowserSession(options = {}) {
  const browser = await chromium.launch({ headless: options.headless ?? true });
  const context = await browser.newContext({
    ignoreHTTPSErrors: false,
    javaScriptEnabled: true,
    viewport: options.viewport ?? { width: 1280, height: 800 },
  });
  return { browser, context };
}

export async function createInstrumentedPage(context, baseOrigin) {
  const page = await context.newPage();
  const session = {
    initialUrl: null,
    finalUrl: null,
    navigationOutcome: null,
    httpStatus: null,
    redirectChain: [],
    consoleErrors: [],
    pageErrors: [],
    failedFirstParty: [],
    failedExternal: [],
    responses: [],
    observationStartedAt: Date.now(),
    instrumentationComplete: false,
    observationWindow: 'initial-navigation-and-readiness',
  };

  page.on('console', (msg) => {
    if (msg.type() === 'error') session.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    session.pageErrors.push(String(err?.message ?? err));
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    const item = { url, error: req.failure()?.errorText ?? 'failed' };
    try {
      if (baseOrigin && originFromUrl(url) === baseOrigin) session.failedFirstParty.push(item);
      else session.failedExternal.push(item);
    } catch {
      session.failedExternal.push(item);
    }
  });
  page.on('response', (resp) => {
    const url = resp.url();
    try {
      if (!baseOrigin || originFromUrl(url) !== baseOrigin) return;
      session.responses.push({ url, status: resp.status() });
    } catch {
      /* ignore */
    }
  });

  async function navigate(url, timeoutMs) {
    session.initialUrl = url;
    let response;
    try {
      response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: Math.min(8000, timeoutMs) }).catch(() => {});
      session.navigationOutcome = 'ok';
    } catch (e) {
      session.navigationOutcome = 'error';
      session.navigationError = String(e?.message ?? e);
      throw e;
    }
    session.finalUrl = page.url();
    session.httpStatus = response?.status() ?? null;
    const chain = [];
    let req = response?.request();
    while (req?.redirectedFrom()) {
      chain.unshift(req.redirectedFrom().url());
      req = req.redirectedFrom();
    }
    session.redirectChain = chain;
    session.instrumentationComplete = true;
    return response;
  }

  return { page, session, navigate };
}

export async function setHtmlContent(page, session, html, timeoutMs) {
  session.initialUrl = 'about:blank';
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  session.finalUrl = 'about:blank';
  session.navigationOutcome = 'html-snapshot';
  session.instrumentationComplete = true;
}
