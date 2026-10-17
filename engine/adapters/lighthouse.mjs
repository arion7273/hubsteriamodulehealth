import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { runCommand } from './exec.mjs';
import { checkPlaywrightBrowsers } from '../playwright-preflight.mjs';
import { resolveLiveAuditUrl } from '../content-frame.mjs';

const lighthouseCli = fileURLToPath(new URL('../../node_modules/lighthouse/cli/index.js', import.meta.url));

export const lighthouseAdapter = {
  id: 'lighthouse',
  name: 'Lighthouse',
  version: '12.x',
  inputModes: ['url', 'html'],
  async preflight(ctx) {
    if (ctx.inputMode === 'html') return { ok: false, reason: 'Lighthouse requires a live URL (not HTML snapshot)' };
    if (!ctx.targetUrl) return { ok: false, reason: 'Lighthouse requires target URL' };
    if (!fs.existsSync(lighthouseCli)) return { ok: false, reason: 'lighthouse package not installed on runner' };
    const pw = await checkPlaywrightBrowsers();
    if (!pw.ok) return { ok: false, reason: pw.reason };
    return { ok: true };
  },
  async run(ctx) {
    const start = Date.now();
    const pf = await this.preflight(ctx);
    if (!pf.ok) {
      return { tool: 'lighthouse', findings: [blockedResult(this, 'ui-a11y', pf.reason, ctx)], artifacts: [] };
    }
    let lighthouseUrl = ctx.targetUrl;
    let lighthouseNote = null;
    try {
      const resolved = await resolveLiveAuditUrl(ctx.targetUrl, {
        timeoutMs: ctx.budgets?.timeoutMs ?? 45_000,
      });
      lighthouseUrl = resolved.auditUrl;
      if (resolved.shellIframe) {
        lighthouseNote = `Entry URL uses iframe shell; Lighthouse ran on embedded content: ${resolved.auditUrl}`;
      }
    } catch (e) {
      lighthouseNote = `Could not resolve iframe content URL; using entry URL. ${String(e?.message ?? e).slice(0, 200)}`;
    }
    const outDir = path.join(ctx.artifactDir ?? '/tmp', 'lighthouse');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${ctx.runId ?? 'run'}.json`);
    const budgets = ctx.budgets?.lighthouse ?? {};
    const categories = budgets.categories ?? ['performance', 'accessibility'];
    const { code, stdout, stderr } = await runCommand(
      process.execPath,
      [
        lighthouseCli,
        lighthouseUrl,
        '--output=json',
        `--output-path=${outFile}`,
        '--quiet',
        '--chrome-flags=--headless --no-sandbox',
        `--only-categories=${categories.join(',')}`,
      ],
      { timeoutMs: ctx.budgets?.lighthouseTimeoutMs ?? 120_000 },
    );
    const findings = [];
    if (code !== 0 || !fs.existsSync(outFile)) {
      findings.push(
        toFinding(
          {
            tool: 'lighthouse',
            toolVersion: '12.x',
            pack: 'ui-a11y',
            checkId: 'lighthouse.run',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'Lighthouse audit failed to complete',
            actual: stderr.slice(0, 500) || stdout.slice(0, 500),
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['lighthouse', 'crash']),
          },
          ctx,
        ),
      );
      return { tool: 'lighthouse', findings, artifacts: [{ type: 'log', path: outFile }] };
    }
    const report = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    const perfMin = budgets.performanceMin ?? 0.5;
    const score = report.categories?.performance?.score;
    if (score != null && score < perfMin) {
      findings.push(
        toFinding(
          {
            tool: 'lighthouse',
            toolVersion: report.lighthouseVersion ?? '12.x',
            pack: 'ui-a11y',
            checkId: 'lighthouse.performance',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'Lighthouse performance below budget',
            expected: `score >= ${perfMin}`,
            actual: String(score),
            detail: lighthouseNote,
            evidence: [{ type: 'lighthouse-json', path: outFile }],
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['lighthouse', 'perf', score]),
          },
          ctx,
        ),
      );
    } else {
      findings.push(
        toFinding(
          {
            tool: 'lighthouse',
            toolVersion: report.lighthouseVersion ?? '12.x',
            pack: 'ui-a11y',
            checkId: 'lighthouse.performance',
            status: STATUS.PASS,
            severity: 'info',
            title: 'Lighthouse performance within budget',
            actual: score != null ? String(score) : 'n/a',
            detail: lighthouseNote,
            evidence: [{ type: 'lighthouse-json', path: outFile }],
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['lighthouse', 'perf-pass']),
          },
          ctx,
        ),
      );
    }
    return { tool: 'lighthouse', findings, artifacts: [{ type: 'lighthouse-json', path: outFile }] };
  },
};
