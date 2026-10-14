#!/usr/bin/env node
/**
 * CLI: run app tests without dashboard.
 * Example:
 *   node scripts/run-app-test.mjs --app defect-fixture --env local --levels 1,4
 */
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry, saveRun } from '../server/storage.mjs';

function parse(argv) {
  const o = { levels: [1] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--app') o.appId = argv[++i];
    else if (a === '--env') o.environment = argv[++i];
    else if (a === '--url') o.targetUrl = argv[++i];
    else if (a === '--levels') o.levels = argv[++i].split(',').map(Number);
    else if (a === '--html-file') o.htmlFile = argv[++i];
  }
  o.inputMode = o.htmlFile ? 'html' : 'url';
  return o;
}

const opts = parse(process.argv.slice(2));
if (!opts.appId) {
  console.error('--app required');
  process.exit(1);
}

const registry = loadRegistry();
const runId = `run_cli_${Date.now()}`;
let htmlSnapshot;
if (opts.htmlFile) {
  const fs = await import('node:fs');
  htmlSnapshot = { html: fs.readFileSync(opts.htmlFile, 'utf8') };
}

const report = await executeRun(
  {
    runId,
    appId: opts.appId,
    environment: opts.environment ?? 'local',
    targetUrl: opts.targetUrl,
    htmlSnapshot,
    inputMode: opts.inputMode,
    levels: opts.levels,
  },
  registry,
  null,
);
saveRun(report);
console.log(JSON.stringify({ runId, gate: report.gate, headline: report.headline }, null, 2));
process.exit(report.gate === 'ship' ? 0 : 1);
