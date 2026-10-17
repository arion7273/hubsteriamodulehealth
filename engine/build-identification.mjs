import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const HEADER_KEYS = [
  'x-vercel-id',
  'x-vercel-deployment-url',
  'x-deployment-id',
  'x-amz-meta-commit',
  'x-git-sha',
  'etag',
];

/**
 * @param {object} opts
 * @param {string} [opts.repoRoot]
 * @param {import('playwright').Page} [opts.page]
 * @param {import('playwright').Response} [opts.response]
 * @param {string} [opts.explicitBuildId]
 */
export async function identifyBuild(opts = {}) {
  if (opts.explicitBuildId) {
    return {
      buildId: String(opts.explicitBuildId),
      source: 'request',
      label: `Build ${opts.explicitBuildId} (from run request)`,
    };
  }

  const fromGit = identifyFromGit(opts.repoRoot);
  if (fromGit) return fromGit;

  const fromHeaders = identifyFromResponseHeaders(opts.response);
  if (fromHeaders) return fromHeaders;

  if (opts.page) {
    const fromPage = await identifyFromPage(opts.page);
    if (fromPage) return fromPage;
  }

  return null;
}

export function identifyFromGit(repoRoot) {
  if (!repoRoot) return null;
  const abs = path.isAbsolute(repoRoot) ? repoRoot : path.resolve(repoRoot);
  if (!fs.existsSync(path.join(abs, '.git'))) return null;

  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: abs, encoding: 'utf8' });
  if (rev.status !== 0 || !rev.stdout?.trim()) return null;
  const sha = rev.stdout.trim();
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: abs, encoding: 'utf8' });
  const branchName = branch.status === 0 ? branch.stdout.trim() : 'unknown';
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: abs, encoding: 'utf8' });
  const suffix = dirty.stdout?.trim() ? ' (dirty working tree)' : '';
  return {
    buildId: sha,
    source: 'git',
    label: `Git ${branchName} @ ${sha.slice(0, 12)}${suffix}`,
    branch: branchName,
    dirty: Boolean(dirty.stdout?.trim()),
  };
}

function identifyFromResponseHeaders(response) {
  if (!response) return null;
  const headers = response.headers();
  for (const key of HEADER_KEYS) {
    const val = headers[key];
    if (val) {
      return {
        buildId: val.length > 120 ? val.slice(0, 120) : val,
        source: `header:${key}`,
        label: `Deploy hint from ${key}: ${String(val).slice(0, 48)}${String(val).length > 48 ? '…' : ''}`,
      };
    }
  }
  return null;
}

async function identifyFromPage(page) {
  try {
    const data = await page.evaluate(() => {
      const metas = [...document.querySelectorAll('meta[name], meta[property]')];
      const pick = (names) => {
        for (const n of names) {
          const el = metas.find((m) => m.getAttribute('name') === n || m.getAttribute('property') === n);
          const c = el?.getAttribute('content');
          if (c) return c;
        }
        return null;
      };
      const build =
        pick(['build-id', 'build', 'git-commit', 'commit-sha', 'application-name']) ||
        document.documentElement?.getAttribute('data-build') ||
        document.documentElement?.getAttribute('data-commit');
      let nextBuild = null;
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (el?.textContent) {
          const j = JSON.parse(el.textContent);
          nextBuild = j?.buildId ?? null;
        }
      } catch {
        /* ignore */
      }
      return { build, nextBuild };
    });
    const id = data.nextBuild || data.build;
    if (!id) return null;
    return {
      buildId: String(id),
      source: data.nextBuild ? 'next-data' : 'meta',
      label: `Page build marker: ${String(id).slice(0, 64)}`,
    };
  } catch {
    return null;
  }
}
