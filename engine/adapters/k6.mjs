import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { commandExists, runCommand } from './exec.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SCRIPT = path.join(__dirname, '../../fixtures/load-k6/smoke.js');

export const k6Adapter = {
  id: 'k6',
  name: 'k6',
  version: '0.52+',
  inputModes: ['url'],
  async preflight(ctx) {
    if (process.env.K6_LOAD_ENABLED !== 'true') {
      return { ok: false, reason: 'k6 load tests disabled by default (staging only, K6_LOAD_ENABLED=true)' };
    }
    if (!(await commandExists('k6', ['version']))) return { ok: false, reason: 'k6 binary not installed' };
    if (ctx.environment === 'production') return { ok: false, reason: 'Load tests blocked on production' };
    return { ok: true };
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'k6', findings: [blockedResult(this, 'load-recovery', pf.reason, ctx)] };
    const start = Date.now();
    const script = ctx.budgets?.k6Script ?? DEFAULT_SCRIPT;
    const { code, stdout, stderr } = await runCommand(
      'k6',
      ['run', script],
      {
        timeoutMs: ctx.budgets?.k6TimeoutMs ?? 60_000,
        env: { BASE_URL: ctx.targetUrl ?? 'http://127.0.0.1:4177' },
      },
    );
    const failedThreshold = stdout.includes('thresholds on metrics') || code !== 0;
    return {
      tool: 'k6',
      findings: [
        toFinding(
          {
            tool: 'k6',
            toolVersion: '0.52+',
            pack: 'load-recovery',
            checkId: 'k6.thresholds',
            status: failedThreshold ? STATUS.FAIL : STATUS.PASS,
            severity: failedThreshold ? 'high' : 'info',
            title: failedThreshold ? 'k6 thresholds failed' : 'k6 scenario within thresholds',
            actual: (stderr || stdout).slice(0, 500),
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['k6', failedThreshold ? 'fail' : 'pass']),
          },
          ctx,
        ),
      ],
    };
  },
};
