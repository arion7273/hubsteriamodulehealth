import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { checkPlaywrightBrowsers } from '../playwright-preflight.mjs';
import { waitForEmbeddedFrames, resolvePrimaryContentFrame } from '../content-frame.mjs';
import { waitForAppReadiness } from '../readiness.mjs';
import { STATUS, fingerprint, toFinding } from './contract.mjs';

export const axeAdapter = {
  id: 'axe-core',
  name: '@axe-core/playwright',
  version: '4.10+',
  inputModes: ['url', 'html'],
  async preflight() {
    const pf = await checkPlaywrightBrowsers();
    return pf.ok ? { ok: true } : { ok: false, reason: pf.reason };
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
        await waitForEmbeddedFrames(page, 10_000);
        await waitForAppReadiness(page, {
          timeoutMs: Math.min(20_000, ctx.budgets?.timeoutMs ?? 45_000),
          selector: ctx.app?.readiness?.selector,
        }).catch(() => {});
      }
      const { shellIframe } = await resolvePrimaryContentFrame(page);
      let builder = new AxeBuilder({ page });
      if (shellIframe) {
        builder = builder.include('iframe');
      }
      const axe = await builder.analyze();
      for (const v of axe.violations ?? []) {
        const nodeCount = v.nodes?.length ?? 0;
        const samples = (v.nodes ?? []).slice(0, 5).map((n) => ({
          type: 'selector',
          value: (n.target ?? []).join(' '),
          html: (n.html ?? '').replace(/\s+/g, ' ').slice(0, 160),
        }));
        const sampleLine = samples
          .map((s) => s.value)
          .filter(Boolean)
          .slice(0, 3)
          .join('; ');
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
              expected: 'No axe violations for this rule on the scanned view.',
              actual: `${nodeCount} element(s); impact=${v.impact}${sampleLine ? ` — e.g. ${sampleLine}` : ''}`,
              detail: v.helpUrl ? `axe rule \`${v.id}\` — ${v.helpUrl}` : 'Scanner finding — not a complete accessibility certification.',
              evidence: samples,
              scannerFinding: true,
              suspectedCause: v.description,
              remediation: v.helpUrl ? { summary: null, steps: [`Docs: ${v.helpUrl}`] } : undefined,
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
