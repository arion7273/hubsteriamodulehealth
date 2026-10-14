import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { createFinding } from '../findings.mjs';

const VIEWPORTS = [
  { id: 'desktop', width: 1280, height: 800 },
  { id: 'tablet-portrait', width: 834, height: 1194 },
  { id: 'tablet-landscape', width: 1194, height: 834 },
  { id: 'mobile', width: 390, height: 844 },
];

/**
 * @param {object} ctx
 */
export async function runLevel4Quality(ctx) {
  const findings = [];
  const { targetUrl, appId, environment, inputMode, htmlSnapshot, budgets } = ctx;
  if (inputMode === 'html' && !htmlSnapshot?.html) {
    return [
      createFinding({
        checkId: 'l4.scope',
        appId,
        environment,
        level: 4,
        status: 'blocked',
        severity: 'info',
        title: 'Quality checks blocked without HTML or URL',
      }),
    ];
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(budgets?.timeoutMs ?? 45000);

  if (inputMode === 'html') {
    await page.setContent(htmlSnapshot.html, { waitUntil: 'domcontentloaded' });
  } else {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }

  for (const vp of VIEWPORTS) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth > doc.clientWidth + 2;
    });
    findings.push(
      createFinding({
        checkId: `l4.layout.overflow.${vp.id}`,
        appId,
        environment,
        level: 4,
        status: overflow ? 'fail' : 'pass',
        severity: overflow ? 'medium' : 'info',
        title: `Horizontal overflow (${vp.id})`,
        expected: 'No horizontal overflow',
        actual: overflow ? 'scrollWidth > clientWidth' : 'ok',
      }),
    );
  }

  try {
    const axeResults = await new AxeBuilder({ page }).analyze();
    const violations = axeResults.violations ?? [];
    if (violations.length) {
      for (const v of violations.slice(0, 8)) {
        findings.push(
          createFinding({
            checkId: `l4.a11y.${v.id}`,
            appId,
            environment,
            level: 4,
            status: 'fail',
            severity: v.impact === 'critical' || v.impact === 'serious' ? 'high' : 'medium',
            title: `Accessibility: ${v.help}`,
            actual: `${v.nodes?.length ?? 0} node(s); impact=${v.impact}`,
            detail: 'Automated axe scan — not a complete accessibility certification.',
            verifiedObservation: true,
            suspectedCause: v.description,
          }),
        );
      }
    } else {
      findings.push(
        createFinding({
          checkId: 'l4.a11y.axe',
          appId,
          environment,
          level: 4,
          status: 'pass',
          severity: 'info',
          title: 'axe: no violations on entry view',
          detail: 'Automated scan only.',
        }),
      );
    }
  } catch (e) {
    findings.push(
      createFinding({
        checkId: 'l4.a11y.axe',
        appId,
        environment,
        level: 4,
        status: 'blocked',
        severity: 'info',
        title: 'axe scan could not complete',
        actual: String(e?.message ?? e),
      }),
    );
  }

  findings.push(
    createFinding({
      checkId: 'l4.visual.baseline',
      appId,
      environment,
      level: 4,
      status: 'not_tested',
      severity: 'info',
      title: 'Screenshot baseline comparison',
      actual: 'Baselines require approved reference images (Phase C).',
    }),
  );

  await browser.close();
  return findings;
}
