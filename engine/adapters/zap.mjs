import path from 'node:path';
import { STATUS, blockedResult, fingerprint, toFinding } from './contract.mjs';
import { originFromUrl } from '../security/url-guard.mjs';

function zapBase(apiUrl) {
  const u = new URL(apiUrl);
  return `${u.origin}${u.pathname.replace(/\/?$/, '/')}`;
}

async function zapJson(base, apiKey, endpoint, params = {}) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(`JSON/${endpoint}/`, root);
  if (apiKey) url.searchParams.set('apikey', apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`ZAP HTTP ${res.status} for ${endpoint}`);
  return res.json();
}

function pathExcluded(url, patterns = []) {
  try {
    const p = new URL(url).pathname;
    return patterns.some((pat) => p.includes(pat));
  } catch {
    return true;
  }
}

export const zapAdapter = {
  id: 'zap',
  name: 'OWASP ZAP',
  version: '2.15+',
  inputModes: ['url'],
  async preflight(ctx) {
    const settingsOn = ctx.moduleSettings?.packs?.security?.zapEnabled === true;
    if (process.env.ZAP_PASSIVE_ENABLED !== 'true' && !settingsOn) {
      return { ok: false, reason: 'ZAP passive scanning disabled (set ZAP_PASSIVE_ENABLED=true or enable in app settings)' };
    }
    if (!process.env.ZAP_API_URL) return { ok: false, reason: 'ZAP_API_URL not configured' };
    if (ctx.inputMode !== 'url') return { ok: false, reason: 'ZAP requires live URL' };
    if (!ctx.targetUrl) return { ok: false, reason: 'ZAP requires target URL' };
    try {
      await zapJson(zapBase(process.env.ZAP_API_URL), process.env.ZAP_API_KEY ?? '', 'core/view/version');
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: `ZAP API unreachable: ${e?.message ?? e}` };
    }
  },
  async run(ctx) {
    const pf = await this.preflight(ctx);
    if (!pf.ok) return { tool: 'zap', findings: [blockedResult(this, 'security', pf.reason, ctx)] };

    const start = Date.now();
    const base = zapBase(process.env.ZAP_API_URL);
    const apiKey = process.env.ZAP_API_KEY ?? '';
    const budgets = ctx.budgets?.zap ?? {};
    const maxChildren = budgets.maxChildren ?? 8;
    const maxDurationMs = budgets.maxDurationMs ?? 90_000;
    const excludePaths = budgets.excludePaths ?? ['/logout', '/signout', '/api/auth/logout'];
    const target = ctx.targetUrl;
    const origin = originFromUrl(target);

    if (pathExcluded(target, excludePaths)) {
      return {
        tool: 'zap',
        findings: [
          blockedResult(this, 'security', 'Target URL matches ZAP exclusion pattern', ctx, {
            status: STATUS.BLOCKED,
          }),
        ],
      };
    }

    const findings = [];
    const deadline = Date.now() + maxDurationMs;

    try {
      await zapJson(base, apiKey, 'core/action/newSession', { name: ctx.runId ?? 'module-health', overwrite: 'true' });
      await zapJson(base, apiKey, 'core/action/accessUrl', { url: target, followRedirects: 'true' });
      const scan = await zapJson(base, apiKey, 'spider/action/scan', {
        url: target,
        maxChildren: String(maxChildren),
        recurse: 'true',
        contextName: '',
      });
      const scanId = scan.scan;
      while (Date.now() < deadline) {
        const st = await zapJson(base, apiKey, 'spider/view/status', { scanId });
        if (Number(st.status) >= 100) break;
        await new Promise((r) => setTimeout(r, 500));
      }

      let passiveLeft = 1;
      while (passiveLeft > 0 && Date.now() < deadline) {
        const ps = await zapJson(base, apiKey, 'pscan/view/recordsToScan');
        passiveLeft = Number(ps.recordsToScan ?? 0);
        if (passiveLeft > 0) await new Promise((r) => setTimeout(r, 400));
      }

      const alerts = await zapJson(base, apiKey, 'core/view/alerts', { baseurl: origin });
      const list = alerts.alerts ?? [];
      const riskRank = { High: 3, Medium: 2, Low: 1, Informational: 0 };

      for (const a of list.slice(0, 30)) {
        if (pathExcluded(a.url ?? target, excludePaths)) continue;
        const risk = a.risk ?? 'Informational';
        if (riskRank[risk] < (riskRank[budgets.minRisk ?? 'Low'] ?? 1)) continue;
        findings.push(
          toFinding(
            {
              tool: 'zap',
              toolVersion: '2.15+',
              pack: 'security',
              checkId: `zap.alert.${a.pluginId ?? a.alert}`,
              status: STATUS.FAIL,
              severity: risk === 'High' ? 'high' : risk === 'Medium' ? 'medium' : 'low',
              title: `ZAP: ${a.alert}`,
              url: a.url,
              actual: a.desc?.slice(0, 300) ?? a.solution,
              detail: 'Passive/spider finding — not a confirmed exploitable vulnerability.',
              scannerFinding: true,
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['zap', a.pluginId, a.url, a.alert]),
            },
            ctx,
          ),
        );
      }

      if (!findings.length) {
        findings.push(
          toFinding(
            {
              tool: 'zap',
              toolVersion: '2.15+',
              pack: 'security',
              checkId: 'zap.summary',
              status: STATUS.PASS,
              severity: 'info',
              title: 'ZAP: no alerts above threshold in scope',
              actual: `Spider scan ${scanId}; origin ${origin}`,
              durationMs: Date.now() - start,
              fingerprint: fingerprint(['zap', 'pass', origin]),
            },
            ctx,
          ),
        );
      }
    } catch (e) {
      findings.push(
        toFinding(
          {
            tool: 'zap',
            toolVersion: '2.15+',
            pack: 'security',
            checkId: 'zap.run',
            status: STATUS.FAIL,
            severity: 'medium',
            title: 'ZAP scan failed',
            actual: String(e?.message ?? e),
            durationMs: Date.now() - start,
            fingerprint: fingerprint(['zap', 'error']),
          },
          ctx,
        ),
      );
    }

    const outFile = path.join(ctx.artifactDir, 'zap-alerts.json');
    const fs = await import('node:fs');
    fs.writeFileSync(outFile, JSON.stringify({ target, findings: findings.length }, null, 2));

    return { tool: 'zap', findings, artifacts: [{ type: 'zap-summary', path: outFile }] };
  },
};
