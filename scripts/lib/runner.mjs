import { CHECKS } from '../../checks/registry.mjs';
import { runFix } from '../../fixes/registry.mjs';
import { resolveModuleRoot } from './manifest.mjs';

const LAYER_ORDER = ['discovery', 'static', 'contract', 'smoke', 'integration', 'conformance'];

/**
 * @param {import('./types.mjs').CheckContext} ctx
 * @param {string[]} [onlyCheckIds]
 * @param {string[]} [layers]
 */
async function runChecksForModule(ctx, onlyCheckIds, layers) {
  const findings = [];
  const layerSet = layers ? new Set(layers) : null;
  const checks = CHECKS.filter((c) => {
    if (onlyCheckIds?.length && !onlyCheckIds.includes(c.checkId)) return false;
    if (layerSet && !layerSet.has(c.layer)) return false;
    return true;
  });

  const sorted = [...checks].sort(
    (a, b) => LAYER_ORDER.indexOf(a.layer) - LAYER_ORDER.indexOf(b.layer),
  );

  for (const check of sorted) {
    const start = Date.now();
    let result = await check.run(ctx);
    if (!result.checkId) result = { ...result, checkId: check.checkId };
    result.durationMs = Date.now() - start;
    findings.push(result);
  }
  return findings;
}

/**
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {object} opts
 */
export async function runAllModules(manifest, opts) {
  const allFindings = [];
  const modules = manifest.modules ?? [];

  const runOne = async (mod) => {
    const moduleRootAbs = resolveModuleRoot(mod);
    const ctx = {
      module: mod,
      moduleRootAbs,
      manifest,
    };
    const layers = opts.layers ?? mod.requiredLayers ?? manifest.defaults?.layers;
    return runChecksForModule(ctx, opts.onlyCheckIds, layers);
  };

  if (manifest.defaults?.parallelModules && modules.length > 1) {
    const batches = await Promise.all(modules.map(runOne));
    for (const b of batches) allFindings.push(...b);
  } else {
    for (const mod of modules) {
      allFindings.push(...(await runOne(mod)));
    }
  }
  return allFindings;
}

/**
 * @param {import('./types.mjs').Finding[]} findings
 * @param {import('./manifest.mjs').Manifest} manifest
 * @param {object} fixOpts
 */
export async function applyFixes(findings, manifest, fixOpts) {
  const toFix = findings.filter((f) => {
    if (f.status !== 'fail') return false;
    if (!f.fix?.fixId) return false;
    if (f.fix.capability !== 'auto') return false;
    if (fixOpts.checkId && f.checkId !== fixOpts.checkId) return false;
    if (fixOpts.fixId && f.fix.fixId !== fixOpts.fixId) return false;
    if (!fixOpts.all && fixOpts.checkId == null && fixOpts.fixId == null) {
      // --fix without id: only high confidence low risk
      if (f.fix.confidence !== 'high' || f.fix.risk !== 'low') return false;
    }
    return true;
  });

  const results = [];
  for (const f of toFix) {
    const mod = manifest.modules.find((m) => m.moduleId === f.moduleId);
    if (!mod) continue;
    const res = await runFix(f.fix.fixId, {
      moduleRootAbs: resolveModuleRoot(mod),
      moduleId: f.moduleId,
      finding: f,
      dryRun: fixOpts.dryRun ?? false,
    });
    results.push({ checkId: f.checkId, fixId: f.fix.fixId, ...res });
    if (res.applied) f.fixedInRun = true;
  }
  return results;
}

export function summarize(findings) {
  const counts = { pass: 0, fail: 0, skip: 0, blocked: 0 };
  const severity = { blocker: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
    if (f.status === 'fail' || f.status === 'blocked') {
      severity[f.severity] = (severity[f.severity] ?? 0) + 1;
    }
  }
  let gate = 'ship';
  if (counts.blocked > 0 && counts.fail === 0) gate = 'investigate_blocked';
  else if ((severity.blocker ?? 0) > 0 || (severity.high ?? 0) > 0) gate = 'fix_blockers';

  return { counts, severity, gate };
}
