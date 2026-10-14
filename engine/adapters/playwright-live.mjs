import { runLevel1QuickHealth } from '../levels/level1-quick-health.mjs';
import { runLevel4Quality } from '../levels/level4-quality.mjs';

export const playwrightLiveAdapter = {
  id: 'playwright',
  name: 'Playwright',
  version: '1.49+',
  inputModes: ['url', 'html'],
  async preflight() {
    return { ok: true };
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
    return {
      tool: 'playwright',
      toolVersion: '1.49+',
      durationMs: Date.now() - start,
      findings,
      artifacts: [],
    };
  },
};
