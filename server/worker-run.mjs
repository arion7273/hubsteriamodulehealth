#!/usr/bin/env node
/**
 * Isolated run worker — executes a single scan job in a child process.
 * Usage: node server/worker-run.mjs <request-json-path>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeRun } from '../engine/run-executor.mjs';
import { loadRegistry, getRun, loadModuleSettings } from './storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const reqPath = process.argv[2];
  if (!reqPath) {
    console.error('request file path required');
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
  const { body, outPath, previousRunId } = payload;
  const registry = loadRegistry();
  const settings = loadModuleSettings(body.appId);
  const previousReport = previousRunId ? getRun(previousRunId) : null;
  const report = await executeRun(
    { ...body, moduleSettings: settings },
    registry,
    previousReport,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
