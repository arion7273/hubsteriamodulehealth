/**
 * Repository-specific Code Health Audit configuration.
 * Reusable core lives in code-health/core; adjust this file when porting to another repo.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.join(__dirname, '..', '..');

/** @type {import('../core/types.mjs').CodeHealthRepoConfig} */
export default {
  id: 'hubsteriamodulehealth',
  repoRoot,
  reportsDir: path.join(repoRoot, 'reports', 'code-health'),
  backlogPath: path.join(repoRoot, 'CODE_HEALTH_BACKLOG.md'),
  baselineFileName: 'baseline.json',

  scope: {
    label: 'Module Health Suite monorepo (root + web + server + engine)',
    includeGlobs: [
      'engine/**/*.mjs',
      'server/**/*.mjs',
      'scripts/**/*.mjs',
      'checks/**/*.mjs',
      'reporters/**/*.mjs',
      'fixes/**/*.mjs',
      'web/src/**/*.{js,jsx,mjs}',
      'registry/**/*.json',
      'schemas/**/*.json',
    ],
  },

  exclusions: {
    jscpd: [
      '**/node_modules/**',
      '**/web/dist/**',
      '**/reports/**',
      '**/data/**',
      '**/.vexp/**',
      '**/fixtures/**/baselines/**',
      '**/*.lock',
      '**/package-lock.json',
    ],
    knip: [
      'reports/**',
      'data/**',
      'web/dist/**',
      'fixtures/defect-app/**',
    ],
    assets: ['web/dist/**', 'node_modules/**', 'reports/**'],
  },

  jscpd: {
    minLines: 6,
    minTokens: 70,
    format: ['javascript', 'jsx', 'typescript', 'json'],
    paths: [
      'engine',
      'server',
      'scripts',
      'checks',
      'reporters',
      'fixes',
      'web/src',
    ],
  },

  knip: {
    entry: [
      'server/index.mjs',
      'server/worker-run.mjs',
      'scripts/run-module-health.mjs',
      'scripts/run-app-test.mjs',
      'scripts/code-health-cli.mjs',
      'web/src/main.jsx',
      'engine/run-executor.mjs',
    ],
    project: [
      'engine/**/*.mjs',
      'server/**/*.mjs',
      'scripts/**/*.mjs',
      'checks/**/*.mjs',
      'reporters/**/*.mjs',
      'fixes/**/*.mjs',
      'web/src/**/*.{js,jsx}',
      'code-health/**/*.mjs',
      'tests/code-health/**/*.mjs',
    ],
    ignoreDependencies: ['playwright', '@axe-core/playwright', 'lighthouse', 'pixelmatch', 'pngjs'],
    ignoreBinaries: ['module-health'],
  },

  eslint: {
    cwd: path.join(repoRoot, 'fixtures', 'sample-repo'),
    command: ['npm', 'run', 'lint', '--', '-f', 'json'],
    label: 'fixtures/sample-repo (representative ESLint gate)',
  },

  typescript: {
    cwd: path.join(repoRoot, 'fixtures', 'sample-repo'),
    command: ['npm', 'run', 'typecheck'],
    label: 'fixtures/sample-repo (TypeScript noEmit)',
  },

  bundle: {
    webPackageDir: path.join(repoRoot, 'web'),
    buildCommand: ['npm', 'run', 'build:web'],
    distDir: path.join(repoRoot, 'web', 'dist'),
    warnChunkBytes: 500 * 1024,
    warnTotalBytes: 2 * 1024 * 1024,
  },

  assets: {
    roots: [
      path.join(repoRoot, 'web', 'public'),
      path.join(repoRoot, 'fixtures', 'defect-app'),
    ],
    warnFileBytes: 250 * 1024,
  },
};
