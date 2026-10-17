import { chromium } from 'playwright';

let cached = /** @type {{ ok: boolean, reason?: string, checkedAt?: number } | null} */ (null);
const CACHE_MS = 60_000;

/**
 * Verify Chromium is installed for this Node process (same env as scan worker).
 */
export async function checkPlaywrightBrowsers() {
  if (cached && Date.now() - (cached.checkedAt ?? 0) < CACHE_MS) return cached;
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    cached = { ok: true, checkedAt: Date.now() };
    return cached;
  } catch (e) {
    const msg = String(e?.message ?? e);
    const reason = msg.includes('Executable doesn')
      ? 'Playwright Chromium is not installed for this runner. From the Module Health repo run: npx playwright install chromium — then restart npm start.'
      : `Playwright launch failed: ${msg.slice(0, 400)}`;
    cached = { ok: false, reason, checkedAt: Date.now() };
    return cached;
  }
}
