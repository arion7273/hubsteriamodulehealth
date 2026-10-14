#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadManifest, REPO_ROOT } from './lib/manifest.mjs';
import { applyFixes, runAllModules } from './lib/runner.mjs';
import { buildReport } from './lib/report-build.mjs';
import { writeJsonReports } from '../reporters/json.mjs';
import { writeMarkdownReport } from '../reporters/markdown.mjs';
import { writeJunitReport } from '../reporters/junit.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const opts = {
    manifest: 'modules.manifest.json',
    out: 'reports/latest',
    fix: false,
    dryRun: false,
    checkId: null,
    fixId: null,
    fixAll: false,
    onlyFailed: false,
    junit: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--fix') opts.fix = true;
    else if (a === '--fix-all') {
      opts.fix = true;
      opts.fixAll = true;
    } else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--manifest') opts.manifest = argv[++i];
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--check-id') opts.checkId = argv[++i];
    else if (a === '--fix-id') opts.fixId = argv[++i];
    else if (a === '--no-junit') opts.junit = false;
    else if (a === 'fix' && !opts.fix) opts.fix = true;
    else if (a === '--help' || a === '-h') opts.help = true;
  }
  return opts;
}

function printHelp() {
  console.log(`Module Health Suite

Usage:
  npm run module:health [--manifest path] [--out dir]
  npm run module:health -- --fix [--check-id ID] [--fix-id ID] [--fix-all] [--dry-run]

Examples:
  npm run module:health
  npm run module:health -- --fix --check-id=env.example.complete
  npm run module:health -- --fix-all
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const manifestPath = path.isAbsolute(opts.manifest)
    ? opts.manifest
    : path.join(REPO_ROOT, opts.manifest);
  const manifest = loadManifest(manifestPath);
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(REPO_ROOT, opts.out);

  let findings = await runAllModules(manifest, {
    onlyCheckIds: opts.checkId && opts.onlyFailed ? [opts.checkId] : undefined,
  });

  const fixResults = [];
  if (opts.fix) {
    const applied = await applyFixes(findings, manifest, {
      checkId: opts.checkId,
      fixId: opts.fixId,
      all: opts.fixAll,
      dryRun: opts.dryRun,
    });
    fixResults.push(...applied);
    if (!opts.dryRun && applied.some((r) => r.applied)) {
      findings = await runAllModules(manifest, {
        onlyCheckIds: opts.checkId ? [opts.checkId] : undefined,
      });
    }
  }

  const report = buildReport(findings, manifest, {
    manifestPath,
    outDir,
    fixResults,
    dryRun: opts.dryRun,
  });

  writeJsonReports(outDir, report);
  writeMarkdownReport(outDir, report);
  if (opts.junit) writeJunitReport(outDir, report);

  console.log(`Module Health gate: ${report.gate}`);
  console.log(`Reports written to ${outDir}`);
  if (fixResults.length) {
    console.log('Fix results:');
    for (const r of fixResults) {
      console.log(`  - ${r.checkId} (${r.fixId}): ${r.message}`);
    }
  }

  const exitCode =
    report.summary.counts.fail > 0 &&
    report.findings.some((f) => f.status === 'fail' && (f.severity === 'blocker' || f.severity === 'high'))
      ? 1
      : 0;
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
