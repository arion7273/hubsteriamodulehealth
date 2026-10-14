/**
 * Classify rendered page state and wait for app readiness (not HTTP 200 alone).
 */

const LOGIN_PATH_RE = /\/(login|signin|sign-in|auth|oauth)(\/|$)/i;
const LOGIN_TEXT_RE = /sign in|log in|password/i;

export async function waitForAppReadiness(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const selector = options.selector;
  const pollMs = 250;
  const start = Date.now();

  if (selector) {
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: timeoutMs });
      const classification = await classifyPageState(page);
      return {
        ready: classification.state === 'ready',
        state: classification.state,
        waitedMs: Date.now() - start,
        method: `selector:${selector}`,
        ...classification,
      };
    } catch {
      const classification = await classifyPageState(page);
      return {
        ready: false,
        state: classification.state === 'ready' ? 'loading' : classification.state,
        waitedMs: Date.now() - start,
        method: `selector-timeout:${selector}`,
        ...classification,
      };
    }
  }

  while (Date.now() - start < timeoutMs) {
    const classification = await classifyPageState(page);
    if (classification.state === 'ready') {
      return {
        ready: true,
        waitedMs: Date.now() - start,
        method: 'visible-text-or-landmark',
        ...classification,
      };
    }
    if (['login_required', 'access_denied', 'bot_challenge'].includes(classification.state)) {
      return {
        ready: false,
        waitedMs: Date.now() - start,
        method: 'early-classification',
        ...classification,
      };
    }
    await page.waitForTimeout(pollMs);
  }

  const final = await classifyPageState(page);
  return {
    ready: false,
    state: final.state === 'ready' ? 'loading' : final.state,
    waitedMs: Date.now() - start,
    method: 'timeout',
    ...final,
  };
}

export async function classifyPageState(page) {
  const url = page.url();
  const data = await page.evaluate(() => {
    const body = document.body;
    const innerText = (body?.innerText ?? '').trim();
    const textContent = (body?.textContent ?? '').trim();
    const root = document.querySelector('#root, #app, [data-testid="root"], main') ?? body;
    const visibleLinks = [...document.querySelectorAll('a[href]')].filter((a) => {
      const r = a.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length;
    const hasPassword = !!document.querySelector('input[type="password"]');
    const busy = !!document.querySelector('[aria-busy="true"]');
    const cf = !!document.querySelector('#cf-challenge, .cf-turnstile, iframe[src*="challenges.cloudflare"]');
    const h1 = (document.querySelector('h1')?.innerText ?? '').trim();
    return {
      innerTextLen: innerText.length,
      textContentLen: textContent.length,
      rootHtmlLen: root?.innerHTML?.length ?? 0,
      rootChildCount: root?.children?.length ?? 0,
      visibleLinks,
      hasPassword,
      busy,
      cf,
      h1,
    };
  });

  const loginPath = LOGIN_PATH_RE.test(url);
  const loginUi = data.hasPassword && data.innerTextLen < 800 && LOGIN_TEXT_RE.test(await page.locator('body').innerText().catch(() => ''));

  if (data.cf) {
    return { state: 'bot_challenge', ...data, url };
  }
  if (loginPath || loginUi) {
    return { state: 'login_required', ...data, url };
  }
  if (/\/403|access.denied|forbidden/i.test(url)) {
    return { state: 'access_denied', ...data, url };
  }
  if (data.busy && data.innerTextLen < 40) {
    return { state: 'loading', ...data, url };
  }
  const hasContent = data.innerTextLen > 0 || data.h1.length > 0 || data.visibleLinks > 0;
  if (!hasContent && data.rootHtmlLen > 100 && data.rootChildCount > 0) {
    return { state: 'blank_screen', ...data, url };
  }
  if (!hasContent) {
    return { state: 'blank_screen', ...data, url };
  }
  return { state: 'ready', ...data, url };
}
