import { checkPlaywrightBrowsers } from '../playwright-preflight.mjs';
import { runLevel1QuickHealth } from '../levels/level1-quick-health.mjs';
import { runLevel3Workflows } from '../levels/level3-workflows.mjs';
import { runLevel4Quality } from '../levels/level4-quality.mjs';
import { runLevel5Resilience } from '../levels/level5-resilience.mjs';

export const playwrightLiveAdapter = {
  id: 'playwright',
  name: 'Playwright',
  version: '1.49+',
  inputModes: ['url', 'html'],
  async preflight() {
    const pf = await checkPlaywrightBrowsers();
    return pf.ok ? { ok: true } : { ok: false, reason: pf.reason };
  },
  async run(ctx) {
    const start = Date.now();
    const findings = [];
    const levels = ctx.levels ?? [];
    if (ctx.activePack === 'quick-health' || levels.includes(1)) {
      findings.push(...(await runLevel1QuickHealth(ctx)));
    }
    if (ctx.activePack === 'ui-a11y' || levels.includes(4)) {
      findings.push(...(await runLevel4Quality(ctx)));
    }
    if (ctx.activePack === 'workflow' || levels.includes(3)) {
      findings.push(...(await runLevel3Workflows(ctx)));
    }
    if (ctx.activePack === 'load-recovery' || levels.includes(5)) {
      findings.push(...(await runLevel5Resilience(ctx)));
    }
    return {
      tool: 'playwright',
      toolVersion: '1.49+',
      durationMs: Date.now() - start,
      findings,
      artifacts: [],
    };
  },
};
