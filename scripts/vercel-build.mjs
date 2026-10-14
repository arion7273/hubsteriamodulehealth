#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { resolveWebRoot } from './lib/vercel-web-root.mjs';

const { webRoot, outputDir, mode } = resolveWebRoot();
console.log(`[vercel-build] mode=${mode} webRoot=${webRoot} outputDir=${outputDir}`);

const result = spawnSync('npm', ['run', 'build'], {
  cwd: webRoot,
  stdio: 'inherit',
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(path.join(outputDir, 'index.html'))) {
  console.error(`[vercel-build] Build output missing index.html at ${outputDir}`);
  process.exit(1);
}

console.log('[vercel-build] OK');
