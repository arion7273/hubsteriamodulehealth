import { playwrightLiveAdapter } from './adapters/playwright-live.mjs';
import { axeAdapter } from './adapters/axe.mjs';
import { lighthouseAdapter } from './adapters/lighthouse.mjs';
import { eslintAdapter } from './adapters/eslint.mjs';
import { typescriptAdapter } from './adapters/typescript.mjs';
import { vitestAdapter } from './adapters/vitest.mjs';
import { semgrepAdapter } from './adapters/semgrep.mjs';
import { gitleaksAdapter } from './adapters/gitleaks.mjs';
import { npmAuditAdapter } from './adapters/npm-audit.mjs';
import { zapAdapter } from './adapters/zap.mjs';
import { k6Adapter } from './adapters/k6.mjs';
import { PACK_DEFINITIONS } from './packs/definitions.mjs';

const CATALOG = [
  { key: 'playwright', label: 'Playwright', adapter: playwrightLiveAdapter, repoOnly: false },
  { key: 'axe-core', label: 'axe-core', adapter: axeAdapter, repoOnly: false },
  { key: 'lighthouse', label: 'Lighthouse', adapter: lighthouseAdapter, repoOnly: false },
  { key: 'eslint', label: 'ESLint', adapter: eslintAdapter, repoOnly: true },
  { key: 'typescript', label: 'TypeScript', adapter: typescriptAdapter, repoOnly: true },
  { key: 'vitest', label: 'Unit/component tests (Vitest)', adapter: vitestAdapter, repoOnly: true },
  { key: 'semgrep', label: 'Semgrep', adapter: semgrepAdapter, repoOnly: true },
  { key: 'gitleaks', label: 'Gitleaks', adapter: gitleaksAdapter, repoOnly: true },
  { key: 'npm-audit', label: 'Dependency audit (npm)', adapter: npmAuditAdapter, repoOnly: true },
  { key: 'zap', label: 'OWASP ZAP', adapter: zapAdapter, repoOnly: false },
  { key: 'k6', label: 'k6', adapter: k6Adapter, repoOnly: false },
];

function findingsForTool(report, toolKey) {
  const findings = report.findings ?? [];
  return findings.filter(
    (f) =>
      f.meta?.tool === toolKey ||
      f.checkId?.startsWith(`${toolKey}.`) ||
      (toolKey === 'playwright' && /^l[1-5]\./.test(f.checkId ?? '')),
  );
}

function packAllowsTool(inputMode, toolKey) {
  for (const [, def] of Object.entries(PACK_DEFINITIONS)) {
    if (!def.inputModes.includes(inputMode)) continue;
    if (def.adapters.includes(toolKey) || (toolKey === 'playwright' && def.adapters.includes('playwright-live'))) {
      return def.label;
    }
  }
  return null;
}

/**
 * @param {object} report
 * @param {{ preflight?: boolean, ctx?: object }} [opts]
 */
export async function buildToolInventory(report, opts = {}) {
  const inputMode = report.inputMode ?? 'url';
  const levels = report.levels ?? [1];
  const toolRuns = report.tools ?? [];
  const artifactRoot = report.meta?.artifactDir ?? `data/artifacts/${report.runId}`;

  const rows = [];

  for (const entry of CATALOG) {
    const adapter = entry.adapter;
    const adapterId = adapter?.id ?? entry.key;
    const implemented = Boolean(adapter);
    let available = null;
    let availableReason = null;

    if (opts.preflight && adapter?.preflight && opts.ctx) {
      try {
        const pf = await adapter.preflight(opts.ctx);
        available = pf.ok;
        availableReason = pf.ok ? null : pf.reason;
      } catch (e) {
        available = false;
        availableReason = String(e?.message ?? e);
      }
    }

    const urlIncompatible = entry.repoOnly && inputMode === 'url';
    const packsRun = new Set(report.packsExecuted ?? []);
    const levelConfigured =
      entry.key === 'playwright' && levels.some((l) => [1, 3, 4].includes(l)) && inputMode !== 'repository';
    const level4Ui = (entry.key === 'axe-core' || entry.key === 'lighthouse') && levels.includes(4);
    const packConfigured =
      (entry.key === 'k6' && packsRun.has('load-recovery')) ||
      (entry.key === 'zap' && packsRun.has('security')) ||
      (['eslint', 'typescript', 'vitest', 'semgrep', 'gitleaks', 'npm-audit'].includes(entry.key) &&
        packsRun.has('code-quality')) ||
      (['gitleaks', 'npm-audit', 'semgrep', 'zap'].includes(entry.key) && packsRun.has('security')) ||
      (['axe-core', 'lighthouse'].includes(entry.key) && packsRun.has('ui-a11y'));
    const configured = urlIncompatible
      ? false
      : Boolean(
          levelConfigured ||
            level4Ui ||
            packConfigured ||
            (inputMode === 'repository' && entry.repoOnly && packsRun.size > 0),
        );
    const configuredPack = packAllowsTool(inputMode, adapterId === 'playwright' ? 'playwright-live' : entry.key);

    let configuredReason = null;
    if (urlIncompatible) {
      configuredReason = 'URL-only scan does not run repository tools.';
    } else if (!configured) {
      configuredReason = 'Not in selected levels/packs for this run.';
    } else if (entry.key === 'k6') {
      configuredReason = 'Load tests require explicit pack and non-production policy.';
    } else if (entry.key === 'zap') {
      configuredReason = 'Active scans disabled; passive/repo scope only when configured.';
    }

    const runRow = toolRuns.find((t) => t.tool === adapterId || t.tool === entry.key);
    const relatedFindings = findingsForTool(report, adapterId === 'playwright' ? 'playwright' : entry.key);
    const executed =
      runRow?.status === 'completed' ||
      (entry.key === 'playwright' && relatedFindings.some((f) => /^l[1-5]\./.test(f.checkId))) ||
      relatedFindings.some((f) => f.meta?.tool === entry.key);

    let executedReason = null;
    if (!executed) {
      if (urlIncompatible) executedReason = 'Skipped: repository input required.';
      else if (!configured) executedReason = configuredReason;
      else executedReason = 'Adapter configured but produced no findings in this run.';
    }

    rows.push({
      tool: entry.label,
      adapterId,
      implemented,
      version: adapter?.version ?? null,
      available,
      availableReason,
      configured,
      configuredReason,
      executed,
      executedReason,
      scope: configuredPack ?? (levelConfigured ? `levels ${levels.join(',')}` : null),
      findingsCount: relatedFindings.length,
      checkOutcomes: {
        pass: relatedFindings.filter((f) => f.status === 'pass').length,
        fail: relatedFindings.filter((f) => f.status === 'fail').length,
        blocked: relatedFindings.filter((f) => f.status === 'blocked').length,
        not_executed: relatedFindings.filter((f) =>
          ['not_tested', 'skip', 'not_started'].includes(f.status),
        ).length,
      },
      evidencePath: executed ? artifactRoot : null,
      runStatus: runRow?.status ?? null,
    });
  }

  return rows;
}
