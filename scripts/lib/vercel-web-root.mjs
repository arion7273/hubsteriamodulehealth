import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve the Vite app directory whether Vercel Root Directory is repo root or `web/`.
 * @param {string} [cwd]
 */
export function resolveWebRoot(cwd = process.cwd()) {
  const atWeb = path.join(cwd, 'package.json');
  if (fs.existsSync(atWeb)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(atWeb, 'utf8'));
      if (pkg.scripts?.build?.includes('vite') || pkg.devDependencies?.vite || pkg.name?.includes('web')) {
        return { webRoot: cwd, outputDir: path.join(cwd, 'dist'), mode: 'web-as-root' };
      }
    } catch {
      /* fall through */
    }
  }

  const nested = path.join(cwd, 'web');
  if (fs.existsSync(path.join(nested, 'package.json'))) {
    return { webRoot: nested, outputDir: path.join(nested, 'dist'), mode: 'monorepo-root' };
  }

  throw new Error(
    'Could not locate web app (expected web/package.json or vite package.json in project root). ' +
      'Check Vercel Root Directory (use empty for repo root, or `web` with web/vercel.json).',
  );
}
