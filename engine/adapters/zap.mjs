import { blockedResult } from './contract.mjs';

export const zapAdapter = {
  id: 'zap',
  name: 'OWASP ZAP',
  version: '2.15+',
  inputModes: ['url'],
  async preflight(ctx) {
    if (process.env.ZAP_PASSIVE_ENABLED !== 'true') {
      return { ok: false, reason: 'ZAP passive scanning disabled by default (set ZAP_PASSIVE_ENABLED=true)' };
    }
    if (!process.env.ZAP_API_URL) return { ok: false, reason: 'ZAP_API_URL not configured' };
    if (ctx.inputMode !== 'url') return { ok: false, reason: 'ZAP requires live URL' };
    return { ok: true };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    return { tool: 'zap', findings: [blockedResult(this, 'security', pf.reason, ctx)] };
  },
};
