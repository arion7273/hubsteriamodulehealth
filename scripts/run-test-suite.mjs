#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const steps = [
  ['node', ['scripts/run-module-health.mjs', '--out', 'reports/ci-before']],
  ['node', ['scripts/run-module-health.mjs', '--fix-all', '--out', 'reports/ci']],
  ['npm', ['run', 'verify:platform']],
  ['npm', ['run', 'verify:adapters']],
  ['npm', ['run', 'verify:reports']],
  ['npm', ['run', 'verify:comparison']],
  ['npm', ['run', 'verify:workflows']],
  ['npm', ['run', 'verify:workspace']],
];

let failed = 0;
for (const [cmd, args] of steps) {
  const label = `${cmd} ${args.join(' ')}`;
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (res.status !== 0) {
    console.error(`\n[test-suite] FAILED (${res.status}): ${label}\n`);
    failed++;
  } else {
    console.error(`[test-suite] ok: ${label}`);
  }
}

if (failed) {
  console.error(`\n[test-suite] ${failed} step(s) failed`);
  process.exit(1);
}
console.error('\n[test-suite] all steps passed');
