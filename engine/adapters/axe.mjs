import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { STATUS, fingerprint, toFinding } from './contract.mjs';

export const axeAdapter = {
  id: 'axe-core',
  name: '@axe-core/playwright',
  version: '4.10+',
  inputModes: ['url', 'html'],
  async preflight() {
    return { ok: true };
  },
  async run(ctx) {
    const start = Date.now();
    const results = [];
    if (ctx.inputMode === 'html' && !ctx.htmlSnapshot?.html) {
      return { tool: 'axe-core', findings: [toFinding({
        tool: 'axe-core', toolVersion: '4.10+', pack: 'ui-a11y', checkId: 'axe.input', status: STATUS.BLOCKED,
        severity: 'info', title: 'axe blocked without HTML or URL', durationMs: 0, fingerprint: fingerprint(['axe','blocked']),
      }, ctx)] };
    }
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      if (ctx.inputMode === 'html') {
        await page.setContent(ctx.htmlSnapshot.html, { waitUntil: 'domcontentloaded' });
      } else {
        await page.goto(ctx.targetUrl, { waitUntil: 'load', timeout: ctx.budgets?.timeoutMs ?? 45000 });
      }
      const axe = await new AxeBuilder({ page }).analyze();
      for (const v of axe.violations ?? []) {
        results.push(
          toFinding(
            {
              tool: 'axe-core',
              toolVersion: axe.toolOptions?.reporter ?? '4.10+',
              rulesetVersion: 'axe-core',
              pack: 'ui-a11y',
              checkId: `axe.rule.${v.id}`,
              status: STATUS.FAIL,
              severity: v.impact === 'critical' || v.impact === 'serious' ? 'high' : 'medium',
              title: `Accessibility: ${v.help}`,
              actual: `${v.nodes?.length ?? 0} node(s); impact=${v.impact}`,
              detail: 'Scanner finding — not a complete accessibility certification.',
              scannerFinding: true,
              suspectedCause: v.description,
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['axe', v.id, v.help]),
            },
            ctx,
          ),
        );
      }
      if (!results.length) {
        results.push(
          toFinding(
            {
              tool: 'axe-core',
              toolVersion: '4.10+',
              pack: 'ui-a11y',
              checkId: 'axe.summary',
              status: STATUS.PASS,
              severity: 'info',
              title: 'axe: no violations on scanned view',
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['axe', 'pass', ctx.targetUrl ?? 'html']),
            },
            ctx,
          ),
        );
      }
    } finally {
      await browser.close();
    }
    return { tool: 'axe-core', findings: results, durationMs: Date.now() - start, artifacts: [] };
  },
};
