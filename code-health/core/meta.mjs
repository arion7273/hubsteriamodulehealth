import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * @param {string} repoRoot
 */
export async function collectGitMeta(repoRoot) {
  const run = async (args) => {
    const { stdout } = await execFileAsync('git', args, { cwd: repoRoot });
    return stdout.trim();
  };
  const branch = await run(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = await run(['rev-parse', 'HEAD']);
  const dirty = (await run(['status', '--porcelain'])) !== '';
  let remote = 'local';
  try {
    remote = await run(['remote', 'get-url', 'origin']);
  } catch {
    /* no origin */
  }
  return { repository: remote, branch, commit, dirtyWorkingTree: dirty };
}

/**
 * @param {string} pkgName
 * @param {string} [repoRoot]
 */
export function readInstalledVersion(pkgName, repoRoot) {
  const candidates = [];
  if (repoRoot) {
    candidates.push(path.join(repoRoot, 'node_modules', pkgName, 'package.json'));
  }
  try {
    candidates.push(require.resolve(`${pkgName}/package.json`));
  } catch {
    /* fall through */
  }
  for (const pkgPath of candidates) {
    try {
      const pkg = require(pkgPath);
      return pkg.version ?? 'unknown';
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * @param {import('./types.mjs').CodeHealthRepoConfig} config
 */
export async function buildAuditMeta(config) {
  const git = await collectGitMeta(config.repoRoot);
  const toolVersions = {
    node: process.version,
    jscpd: readInstalledVersion('jscpd', config.repoRoot) ?? 'not-installed',
    knip: readInstalledVersion('knip', config.repoRoot) ?? 'not-installed',
  };
  return {
    ...git,
    scanTimeIso: new Date().toISOString(),
    toolVersions,
    scopeLabel: config.scope.label,
    exclusions: [
      ...config.exclusions.jscpd.map((e) => `jscpd:${e}`),
      ...config.exclusions.knip.map((e) => `knip:${e}`),
    ],
  };
}

/**
 * @param {string} reportsDir
 */
export function defaultReportPaths(reportsDir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    json: path.join(reportsDir, `audit-${stamp}.json`),
    html: path.join(reportsDir, `audit-${stamp}.html`),
    latestJson: path.join(reportsDir, 'latest.json'),
    latestHtml: path.join(reportsDir, 'latest.html'),
  };
}
