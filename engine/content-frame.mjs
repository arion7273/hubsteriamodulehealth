/**
 * Pages that mount the real UI in a same-origin iframe (shell + iframe) need
 * readiness and axe scoped to the content frame, not the empty parent document.
 */

import { chromium } from 'playwright';

/**
 * @param {import('playwright').Page} page
 * @param {number} [budgetMs]
 */
export async function waitForEmbeddedFrames(page, budgetMs = 8000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const childFrames = page.frames().filter((f) => f !== page.mainFrame());
    if (!childFrames.length) return;
    let pending = false;
    for (const frame of childFrames) {
      const frameUrl = frame.url();
      if (!frameUrl || frameUrl === 'about:blank') {
        pending = true;
        continue;
      }
      try {
        await frame.waitForLoadState('domcontentloaded', { timeout: 400 });
        await frame.waitForLoadState('load', { timeout: 400 }).catch(() => {});
      } catch {
        pending = true;
      }
    }
    if (!pending) return;
    await page.waitForTimeout(200);
  }
}

/**
 * DOM metrics for one frame (Playwright Frame or Page).
 * @param {import('playwright').Frame | import('playwright').Page} frame
 */
export async function measureFrameDocument(frame) {
  return frame.evaluate(() => {
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
    const hasMain = !!document.querySelector('main, [role="main"]');
    const iframeCount = document.querySelectorAll('iframe').length;
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
      hasMain,
      iframeCount,
    };
  });
}

/**
 * @param {import('playwright').Page} page
 */
export async function collectFrameMeasures(page) {
  const snapshots = [];
  for (const frame of page.frames()) {
    try {
      const data = await measureFrameDocument(frame);
      snapshots.push({
        isMain: frame === page.mainFrame(),
        frameUrl: frame.url(),
        ...data,
      });
    } catch {
      /* cross-origin or detached */
    }
  }
  return snapshots;
}

/**
 * Frame that best represents user-visible app content.
 * @param {ReturnType<typeof collectFrameMeasures> extends Promise<infer T> ? T : never} snapshots
 */
export function pickPrimaryContentSnapshot(snapshots) {
  if (!snapshots?.length) return null;
  const main = snapshots.find((s) => s.isMain);
  const children = snapshots.filter((s) => !s.isMain);
  const score = (s) =>
    (s.innerTextLen ?? 0) +
    (s.visibleLinks ?? 0) * 40 +
    (s.h1?.length ?? 0) * 20 +
    (s.hasMain ? 80 : 0);

  let best = main ?? snapshots[0];
  let bestScore = score(best);
  for (const s of children) {
    const sc = score(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  const mainScore = main ? score(main) : 0;
  const shellIframe =
    main &&
    main.iframeCount > 0 &&
    main.innerTextLen < 40 &&
    main.visibleLinks === 0 &&
    bestScore > mainScore + 50;
  return { snapshot: best, shellIframe, main, children };
}

/**
 * @param {import('playwright').Page} page
 */
export async function resolvePrimaryContentFrame(page) {
  const snapshots = await collectFrameMeasures(page);
  const { snapshot, shellIframe } = pickPrimaryContentSnapshot(snapshots);
  if (!snapshot) return { frame: page.mainFrame(), shellIframe: false, snapshots };

  if (!shellIframe && snapshot.isMain) {
    return { frame: page.mainFrame(), shellIframe: false, snapshots };
  }

  const match = page.frames().find((f) => f.url() === snapshot.frameUrl && f !== page.mainFrame());
  return { frame: match ?? page.mainFrame(), shellIframe: !!shellIframe, snapshots };
}

/**
 * Lighthouse and other CLI tools need a URL that actually paints content.
 * @param {string} targetUrl
 * @param {{ timeoutMs?: number, frameWaitMs?: number }} [options]
 */
export async function resolveLiveAuditUrl(targetUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 45_000;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(targetUrl, { waitUntil: 'load', timeout: timeoutMs });
    await waitForEmbeddedFrames(page, options.frameWaitMs ?? 10_000);
    const { frame, shellIframe } = await resolvePrimaryContentFrame(page);
    const frameUrl = frame.url();
    if (shellIframe && frameUrl && !frameUrl.startsWith('about:')) {
      return { auditUrl: frameUrl, shellIframe: true, entryUrl: targetUrl };
    }
    return { auditUrl: page.url(), shellIframe: false, entryUrl: targetUrl };
  } finally {
    await browser.close();
  }
}
