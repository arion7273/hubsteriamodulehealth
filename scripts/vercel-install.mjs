#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolveWebRoot } from './lib/vercel-web-root.mjs';

const { webRoot, mode } = resolveWebRoot();
console.log(`[vercel-install] mode=${mode} webRoot=${webRoot}`);

const npmCmd = process.env.VERCEL === '1' || process.env.CI === 'true' ? 'ci' : 'install';
const result = spawnSync('npm', [npmCmd], {
  cwd: webRoot,
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status === 0 ? 0 : result.status ?? 1);
