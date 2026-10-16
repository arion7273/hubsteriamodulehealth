import fs from 'node:fs/promises';
import path from 'node:path';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { runCommand, scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runBundleScanner(config) {
  const start = Date.now();
  const { webPackageDir, buildCommand, distDir, warnChunkBytes, warnTotalBytes } = config.bundle;

  try {
    await fs.access(path.join(webPackageDir, 'package.json'));
  } catch {
    return scannerResult('bundle', 'Vite production bundle', 'skipped', {
      skipReason: 'web package missing',
    });
  }

  const repoBuild = path.join(config.repoRoot, 'package.json');
  try {
    await fs.access(repoBuild);
    const { code, stderr } = await runCommand('npm', ['run', 'build:web'], {
      cwd: config.repoRoot,
      timeoutMs: 300_000,
    });
    if (code !== 0) {
      return scannerResult('bundle', 'Vite production bundle', 'failed', {
        durationMs: Date.now() - start,
        error: stderr.slice(0, 600),
      });
    }

    const files = await listDistFiles(distDir);
    const total = files.reduce((s, f) => s + f.bytes, 0);
    const findings = [];

    for (const f of files) {
      if (f.bytes >= warnChunkBytes) {
        const fp = fingerprint(['bundle-chunk', f.file, String(f.bytes)].join('|'));
        findings.push({
          id: stableFindingId('BUNDLE', fp),
          category: 'bundle-bloat',
          priority: f.bytes >= warnChunkBytes * 2 ? 'high' : 'medium',
          confidence: 'high',
          cleanupRisk: 'medium',
          locations: [{ file: path.relative(config.repoRoot, path.join(distDir, f.file)) }],
          scanner: 'bundle',
          evidence: { bytes: f.bytes, gzipNote: 'raw file size (not gzip)' },
          summary: `Large bundle chunk ${formatBytes(f.bytes)}: ${f.file}`,
          whyItMatters: 'Measured production output size affects download and parse time in the browser.',
          proposedChange: 'Code-split, lazy routes, or audit heavy dependencies; re-run health:audit bundle scanner.',
          affectedWorkflows: ['npm run build:web', 'Vercel deploy'],
          verificationRequired: ['npm run build:web', 'browser network waterfall'],
          status: 'open',
          fingerprint: fp,
        });
      }
    }

    if (total >= warnTotalBytes) {
      const fp = fingerprint(['bundle-total', String(total)].join('|'));
      findings.push({
        id: stableFindingId('BUNDLE', fp),
        category: 'bundle-bloat',
        priority: 'medium',
        confidence: 'high',
        cleanupRisk: 'medium',
        locations: [{ file: path.relative(config.repoRoot, distDir) }],
        scanner: 'bundle',
        evidence: { totalBytes: total, fileCount: files.length, warnTotalBytes },
        summary: `Total dist output ${formatBytes(total)} across ${files.length} files`,
        whyItMatters: 'Aggregate bundle size is a measurable deploy artifact (not inferred savings).',
        proposedChange: 'Review largest chunks in evidence; defer optimization until Prompt 2 backlog execution.',
        affectedWorkflows: ['production web deploy'],
        verificationRequired: ['health:audit bundle section', 'Lighthouse or network tab'],
        status: 'open',
        fingerprint: fp,
      });
    }

    return scannerResult('bundle', 'Vite production bundle', 'completed', {
      durationMs: Date.now() - start,
      version: 'vite-build',
      findings,
      raw: { totalBytes: total, files },
    });
  } catch (err) {
    return scannerResult('bundle', 'Vite production bundle', 'failed', {
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {string} distDir
 */
async function listDistFiles(distDir) {
  const out = [];
  async function walk(rel = '') {
    const full = path.join(distDir, rel);
    const entries = await fs.readdir(full, { withFileTypes: true });
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) await walk(childRel);
      else if (ent.isFile()) {
        const stat = await fs.stat(path.join(distDir, childRel));
        out.push({ file: childRel, bytes: stat.size });
      }
    }
  }
  await walk();
  return out.sort((a, b) => b.bytes - a.bytes);
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
