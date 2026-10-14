import fs from 'node:fs';
import path from 'node:path';

export function detectProject(repoRoot) {
  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { valid: false, reason: 'No package.json' };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts ?? {};
  const pm = fs.existsSync(path.join(repoRoot, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : fs.existsSync(path.join(repoRoot, 'yarn.lock'))
      ? 'yarn'
      : 'npm';

  const testRunner =
    scripts.test?.includes('vitest') || (pkg.devDependencies?.vitest || pkg.dependencies?.vitest)
      ? 'vitest'
      : scripts.test?.includes('jest')
        ? 'jest'
        : scripts.test
          ? 'npm-test'
          : null;

  return {
    valid: true,
    packageManager: pm,
    scripts,
    testRunner,
    hasEslint: !!(scripts.lint || pkg.devDependencies?.eslint),
    hasTypecheck: !!(scripts.typecheck || scripts['type-check'] || fs.existsSync(path.join(repoRoot, 'tsconfig.json'))),
    eslintConfig: fs.existsSync(path.join(repoRoot, 'eslint.config.js'))
      ? 'eslint.config.js'
      : fs.existsSync(path.join(repoRoot, '.eslintrc.cjs'))
        ? '.eslintrc.cjs'
        : null,
    tsconfig: fs.existsSync(path.join(repoRoot, 'tsconfig.json')),
  };
}

export function pmExec(pm, scriptOrArgs) {
  if (Array.isArray(scriptOrArgs)) return { cmd: pm, args: scriptOrArgs };
  if (pm === 'npm') return { cmd: 'npm', args: ['run', scriptOrArgs, '--if-present'] };
  if (pm === 'pnpm') return { cmd: 'pnpm', args: ['run', scriptOrArgs] };
  return { cmd: 'yarn', args: ['run', scriptOrArgs] };
}
