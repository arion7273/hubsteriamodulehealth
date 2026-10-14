#!/usr/bin/env node
import {
  exportMigrationBundle,
  writeBundleFile,
} from './lib/migrate-cloud.mjs';

function parse(argv) {
  const o = { includeRuns: false, maxRuns: 200, note: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--runs') o.includeRuns = true;
    else if (a === '--max-runs') o.maxRuns = Number(argv[++i]);
    else if (a === '--note') o.note = argv[++i];
  }
  return o;
}

const opts = parse(process.argv.slice(2));
if (!opts.out) {
  console.error('Usage: npm run migrate:export -- --out migration-bundle.json [--runs] [--max-runs 500]');
  process.exit(1);
}

const bundle = exportMigrationBundle(opts);
writeBundleFile(bundle, opts.out);
console.log(JSON.stringify({ ok: true, out: opts.out, apps: bundle.registryOverlay.apps?.length ?? 0, runs: bundle.runs?.length ?? 0 }, null, 2));
