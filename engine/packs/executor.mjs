import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_DEFINITIONS } from './definitions.mjs';
import { playwrightLiveAdapter } from '../adapters/playwright-live.mjs';
import { axeAdapter } from '../adapters/axe.mjs';
import { lighthouseAdapter } from '../adapters/lighthouse.mjs';
import { eslintAdapter } from '../adapters/eslint.mjs';
import { typescriptAdapter } from '../adapters/typescript.mjs';
import { vitestAdapter } from '../adapters/vitest.mjs';
import { jestAdapter } from '../adapters/jest.mjs';
import { gitleaksAdapter } from '../adapters/gitleaks.mjs';
import { dependencyAuditAdapter } from '../adapters/dependency-audit.mjs';
import { semgrepAdapter } from '../adapters/semgrep.mjs';
import { zapAdapter } from '../adapters/zap.mjs';
import { k6Adapter } from '../adapters/k6.mjs';
import { createFinding } from '../findings.mjs';
import { blockedResult } from '../adapters/contract.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADAPTERS = {
  'playwright-live': playwrightLiveAdapter,
  'axe-core': axeAdapter,
  lighthouse: lighthouseAdapter,
  eslint: eslintAdapter,
  typescript: typescriptAdapter,
  vitest: vitestAdapter,
  jest: jestAdapter,
  gitleaks: gitleaksAdapter,
  'dependency-audit': dependencyAuditAdapter,
  'npm-audit': dependencyAuditAdapter,
  semgrep: semgrepAdapter,
  zap: zapAdapter,
  k6: k6Adapter,
};

function adapterAllowedForPack(packId, adapterId, ctx) {
  const def = PACK_DEFINITIONS[packId];
  const adapter = ADAPTERS[adapterId];
  if (!def || !adapter) return false;
  if (adapter.inputModes.includes(ctx.inputMode)) return true;
  if (packId === 'security' && adapterId === 'zap' && ctx.inputMode === 'url') return true;
  if (
    packId === 'security' &&
    ['gitleaks', 'dependency-audit', 'npm-audit', 'semgrep'].includes(adapterId) &&
    ctx.inputMode === 'repository'
  ) {
    return true;
  }
  return false;
}

/**
 * @param {object} ctx run context
 * @param {string[]} packs
 */
export async function executePacks(ctx, packs) {
  const artifactDir = path.join(__dirname, '../../data/artifacts', ctx.runId ?? 'run');
  fs.mkdirSync(artifactDir, { recursive: true });
  const baseCtx = { ...ctx, artifactDir };

  const toolRuns = [];
  const allFindings = [];

  const packSettings = ctx.moduleSettings?.packs ?? {};

  for (const packId of packs) {
    const def = PACK_DEFINITIONS[packId];
    if (!def) continue;

    if (packSettings[packId]?.enabled === false) {
      allFindings.push(
        createFinding({
          checkId: `pack.${packId}.disabled`,
          appId: ctx.appId,
          environment: ctx.environment,
          status: 'not_tested',
          severity: 'info',
          title: `Pack ${def.label} disabled in settings`,
        }),
      );
      continue;
    }

    for (const adapterId of def.adapters) {
      const adapter = ADAPTERS[adapterId];
      if (!adapter) continue;

      if (adapterId === 'gitleaks' && packSettings.security?.gitleaksEnabled === false) {
        continue;
      }

      if (!adapterAllowedForPack(packId, adapterId, ctx)) {
        allFindings.push(
          createFinding({
            checkId: `${adapterId}.input-mode`,
            appId: ctx.appId,
            environment: ctx.environment,
            level: 1,
            status: 'not_applicable',
            severity: 'info',
            title: `${adapter.name} not applicable for input mode ${ctx.inputMode}`,
            actual: `Pack ${packId} requires ${def.inputModes.join(' or ')}`,
            detail: 'HTML-only mode cannot execute repository or backend verification as live coverage.',
          }),
        );
        continue;
      }

      const runCtx = {
        ...baseCtx,
        activePack: packId,
        levels: def.playwrightLevels ?? ctx.levels ?? [1],
        packs: [packId],
        skipAxe: packId === 'ui-a11y' && def.adapters.includes('axe-core'),
      };

      if (adapterId === 'zap' && packSettings.security?.zapEnabled !== true && process.env.ZAP_PASSIVE_ENABLED !== 'true') {
        allFindings.push(blockedResult(adapter, packId, 'ZAP disabled in pack settings', runCtx));
        toolRuns.push({ tool: adapter.id, pack: packId, status: 'blocked', reason: 'settings' });
        continue;
      }
      if (adapterId === 'k6' && packSettings['load-recovery']?.k6Enabled !== true && process.env.K6_LOAD_ENABLED !== 'true') {
        allFindings.push(blockedResult(adapter, packId, 'k6 disabled in pack settings', runCtx));
        toolRuns.push({ tool: adapter.id, pack: packId, status: 'blocked', reason: 'settings' });
        continue;
      }

      const started = Date.now();
      try {
        const pf = await adapter.preflight(runCtx);
        if (!pf.ok) {
          allFindings.push(blockedResult(adapter, packId, pf.reason, runCtx));
          toolRuns.push({
            tool: adapter.id,
            version: adapter.version,
            pack: packId,
            status: 'blocked',
            reason: pf.reason,
            durationMs: Date.now() - started,
          });
          continue;
        }
        const result = await adapter.run(runCtx);
        allFindings.push(...(result.findings ?? []));
        toolRuns.push({
          tool: adapter.id,
          version: adapter.version,
          pack: packId,
          status: 'completed',
          durationMs: Date.now() - started,
          artifacts: result.artifacts ?? [],
        });
      } catch (e) {
        allFindings.push(
          createFinding({
            checkId: `${adapterId}.crash`,
            appId: ctx.appId,
            environment: ctx.environment,
            status: 'fail',
            severity: 'blocker',
            title: `${adapter.name} runner crashed`,
            actual: String(e?.message ?? e),
          }),
        );
        toolRuns.push({
          tool: adapter.id,
          pack: packId,
          status: 'crashed',
          durationMs: Date.now() - started,
        });
      }
    }
  }

  return { findings: allFindings, toolRuns };
}
