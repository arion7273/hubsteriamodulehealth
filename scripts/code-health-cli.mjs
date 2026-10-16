#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import repoConfig from '../code-health/config/hubsteriamodulehealth.mjs';
import { runCodeHealthAudit, loadBaseline } from '../code-health/core/run-audit.mjs';
import { compareToBaseline, buildBaselineFromReport } from '../code-health/core/compare-baseline.mjs';
import { buildCleanupPlan } from '../code-health/core/plan.mjs';
import { renderJsonReport } from '../code-health/core/render-json.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const config = repoConfig;
  const flagSkipBundle = rest.includes('--skip-bundle');

  switch (command) {
    case 'audit':
      await cmdAudit(config, flagSkipBundle);
      break;
    case 'compare':
      await cmdCompare(config);
      break;
    case 'plan':
      await cmdPlan(config);
      break;
    case 'baseline':
      await cmdBaseline(config, rest.includes('--force'));
      break;
    default:
      console.error(`Usage: node scripts/code-health-cli.mjs <audit|compare|plan|baseline> [--skip-bundle] [--force]`);
      process.exit(command ? 1 : 0);
  }
}

/**
 * @param {import('../code-health/core/types.mjs').CodeHealthRepoConfig} config
 * @param {boolean} skipBundle
 */
async function cmdAudit(config, skipBundle) {
  const baseline = await loadBaseline(config);
  const previous = new Map();
  if (baseline?.findings) {
    for (const f of baseline.findings) {
      previous.set(f.fingerprint, f);
    }
  }

  const appSourcesBefore = await hashAppTree(config.repoRoot);
  const { report, paths } = await runCodeHealthAudit(config, { skipBundle, previousFindings: previous });
  const appSourcesAfter = await hashAppTree(config.repoRoot);
  if (appSourcesBefore !== appSourcesAfter) {
    console.error('ERROR: Application source tree changed during audit (only reports/backlog should change).');
    process.exit(2);
  }

  const comparison = compareToBaseline(report.findings, baseline, report.scanners);
  const comparePath = path.join(config.reportsDir, 'latest-compare.json');
  await fs.writeFile(comparePath, JSON.stringify(comparison, null, 2), 'utf8');

  console.log('Code Health Audit complete');
  console.log(`  JSON: ${paths.latestJson}`);
  console.log(`  HTML: ${paths.latestHtml}`);
  console.log(`  Backlog: ${config.backlogPath}`);
  console.log(`  Compare: ${comparePath}`);
  console.log(`  Findings: ${report.findings.length}`);
  for (const s of report.scanners) {
    console.log(`  - ${s.id}: ${s.status} (${s.findings.length} findings)`);
  }
}

/**
 * @param {import('../code-health/core/types.mjs').CodeHealthRepoConfig} config
 */
async function cmdCompare(config) {
  const latestPath = path.join(config.reportsDir, 'latest.json');
  const baseline = await loadBaseline(config);
  let report;
  try {
    report = JSON.parse(await fs.readFile(latestPath, 'utf8'));
  } catch {
    console.error('No latest.json — run health:audit first.');
    process.exit(1);
  }
  const comparison = compareToBaseline(report.findings, baseline, report.scanners);
  const out = path.join(config.reportsDir, 'compare.json');
  await fs.writeFile(out, JSON.stringify(comparison, null, 2), 'utf8');
  console.log(`Wrote ${out}`);
  console.log(`  New: ${comparison.newFindings.length}, Resolved: ${comparison.resolvedFindings.length}`);
  for (const n of comparison.notes ?? []) console.log(`  Note: ${n}`);
}

/**
 * @param {import('../code-health/core/types.mjs').CodeHealthRepoConfig} config
 */
async function cmdPlan(config) {
  const latestPath = path.join(config.reportsDir, 'latest.json');
  let report;
  try {
    report = JSON.parse(await fs.readFile(latestPath, 'utf8'));
  } catch {
    console.error('No latest.json — run health:audit first.');
    process.exit(1);
  }
  const plan = buildCleanupPlan(report.findings);
  const out = path.join(config.reportsDir, 'cleanup-plan.json');
  await fs.writeFile(out, JSON.stringify(plan, null, 2), 'utf8');
  console.log(`Wrote ${out}`);
  console.log(`Open findings: ${plan.totalOpen}`);
  console.log('Recommended batch:');
  for (const item of plan.recommendedBatch) {
    console.log(`  - ${item.id} [${item.priority}] ${item.summary}`);
  }
}

/**
 * @param {import('../code-health/core/types.mjs').CodeHealthRepoConfig} config
 * @param {boolean} force
 */
async function cmdBaseline(config, force) {
  const baselinePath = path.join(config.reportsDir, config.baselineFileName);
  try {
    await fs.access(baselinePath);
    if (!force) {
      console.error(`Baseline exists at ${baselinePath}. Pass --force to replace (never silent).`);
      process.exit(1);
    }
  } catch {
    /* ok */
  }

  const latestPath = path.join(config.reportsDir, 'latest.json');
  let report;
  try {
    report = JSON.parse(await fs.readFile(latestPath, 'utf8'));
  } catch {
    console.error('No latest.json — run health:audit first.');
    process.exit(1);
  }

  const failed = report.scanners.some((s) => s.status === 'failed');
  if (failed && !force) {
    console.error('Scanners failed; baseline not written. Fix failures or use --force explicitly.');
    process.exit(1);
  }

  const baseline = buildBaselineFromReport(report);
  await renderJsonReport(baseline, baselinePath);
  console.log(`Baseline saved: ${baselinePath}`);
}

/**
 * Hash mtime+size of app source paths to detect accidental edits during audit.
 * @param {string} repoRoot
 */
async function hashAppTree(repoRoot) {
  const roots = ['engine', 'server', 'web/src', 'checks', 'reporters', 'fixes', 'registry', 'schemas'];
  const parts = [];
  for (const rel of roots) {
    const full = path.join(repoRoot, rel);
    try {
      await walk(full, parts);
    } catch {
      /* missing */
    }
  }
  return parts.sort().join('|');
}

/**
 * @param {string} dir
 * @param {string[]} parts
 */
async function walk(dir, parts) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) await walk(full, parts);
    else if (ent.isFile()) {
      const st = await fs.stat(full);
      parts.push(`${full}:${st.mtimeMs}:${st.size}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
