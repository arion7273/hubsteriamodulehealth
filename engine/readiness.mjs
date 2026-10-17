/**
 * Classify rendered page state and wait for app readiness (not HTTP 200 alone).
 */

import {
  waitForEmbeddedFrames,
  collectFrameMeasures,
  pickPrimaryContentSnapshot,
} from './content-frame.mjs';

const LOGIN_PATH_RE = /\/(login|signin|sign-in|auth|oauth)(\/|$)/i;
const LOGIN_TEXT_RE = /sign in|log in|password/i;

export async function waitForAppReadiness(page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const selector = options.selector;
  const pollMs = 250;
  const start = Date.now();

  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: Math.min(6000, timeoutMs) }).catch(() => {});
  await waitForEmbeddedFrames(page, Math.min(8000, timeoutMs));

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

async function classifyPageState(page) {
  const url = page.url();
  const snapshots = await collectFrameMeasures(page);
  const { snapshot: data, shellIframe, main } = pickPrimaryContentSnapshot(snapshots);
  const contentFrameUrl = data?.frameUrl && !data?.isMain ? data.frameUrl : null;

  const loginPath = LOGIN_PATH_RE.test(url);
  const loginUi =
    data.hasPassword &&
    data.innerTextLen < 800 &&
    LOGIN_TEXT_RE.test(await page.locator('body').innerText().catch(() => ''));

  const anyCf = snapshots.some((s) => s.cf);
  if (anyCf || data.cf) {
    return { state: 'bot_challenge', ...data, url, shellIframe, contentFrameUrl };
  }
  if (loginPath || loginUi) {
    return { state: 'login_required', ...data, url, shellIframe, contentFrameUrl };
  }
  if (/\/403|access.denied|forbidden/i.test(url)) {
    return { state: 'access_denied', ...data, url, shellIframe, contentFrameUrl };
  }
  if (data.busy && data.innerTextLen < 40) {
    return { state: 'loading', ...data, url, shellIframe, contentFrameUrl };
  }
  const hasContent = data.innerTextLen > 0 || data.h1.length > 0 || data.visibleLinks > 0;
  const mainLooksLikeShell =
    main &&
    main.iframeCount > 0 &&
    main.innerTextLen < 40 &&
    main.visibleLinks === 0 &&
    hasContent &&
    shellIframe;
  if (!hasContent && data.rootHtmlLen > 100 && data.rootChildCount > 0) {
    return { state: 'blank_screen', ...data, url, shellIframe, contentFrameUrl };
  }
  if (!hasContent) {
    return { state: 'blank_screen', ...data, url, shellIframe, contentFrameUrl };
  }
  return {
    state: 'ready',
    ...data,
    url,
    shellIframe: mainLooksLikeShell || shellIframe,
    contentFrameUrl,
  };
}
