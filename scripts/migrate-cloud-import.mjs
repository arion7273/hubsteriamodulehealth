#!/usr/bin/env node
import {
  importMigrationBundle,
  readBundleFile,
} from './lib/migrate-cloud.mjs';

function parse(argv) {
  const o = { merge: false, dryRun: false, replaceRuns: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--in') o.in = argv[++i];
    else if (a === '--merge') o.merge = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--replace-runs') o.replaceRuns = true;
  }
  return o;
}

const opts = parse(process.argv.slice(2));
if (!opts.in) {
  console.error('Usage: npm run migrate:import -- --in migration-bundle.json [--merge] [--dry-run] [--replace-runs]');
  process.exit(1);
}

const bundle = readBundleFile(opts.in);
const report = importMigrationBundle(bundle, opts);
console.log(JSON.stringify({ ok: true, ...report, checklist: bundle.checklist }, null, 2));
