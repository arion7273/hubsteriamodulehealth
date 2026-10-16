import fs from 'node:fs/promises';
import path from 'node:path';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runAssetsScanner(config) {
  const start = Date.now();
  const inventory = [];
  const findings = [];

  for (const root of config.assets.roots) {
    try {
      await walkFiles(root, async (filePath, size) => {
        const rel = path.relative(config.repoRoot, filePath);
        inventory.push({ file: rel, bytes: size });
        if (size >= config.assets.warnFileBytes) {
          const fp = fingerprint(['asset', rel, String(size)].join('|'));
          findings.push({
            id: stableFindingId('ASSET', fp),
            category: 'asset-bloat',
            priority: size >= config.assets.warnFileBytes * 2 ? 'high' : 'medium',
            confidence: 'high',
            cleanupRisk: 'low',
            locations: [{ file: rel }],
            scanner: 'assets',
            evidence: { bytes: size, warnThreshold: config.assets.warnFileBytes },
            summary: `Large static asset (${formatBytes(size)}): ${rel}`,
            whyItMatters: 'Large static files affect deploy size and first-load time when served directly.',
            proposedChange: 'Compress, resize, or lazy-load; measure before/after in browser network tab.',
            affectedWorkflows: ['web deploy', 'landing page', 'fixture hosting'],
            verificationRequired: ['visual check', 'npm run build:web'],
            status: 'open',
            fingerprint: fp,
          });
        }
      });
    } catch {
      /* missing root */
    }
  }

  return scannerResult('assets', 'Static asset inventory', 'completed', {
    durationMs: Date.now() - start,
    version: '1.0.0',
    findings,
    raw: {
      fileCount: inventory.length,
      totalBytes: inventory.reduce((s, i) => s + i.bytes, 0),
      largest: [...inventory].sort((a, b) => b.bytes - a.bytes).slice(0, 15),
    },
  });
}

/**
 * @param {string} dir
 * @param {(file: string, size: number) => Promise<void>} onFile
 */
async function walkFiles(dir, onFile) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkFiles(full, onFile);
    } else if (ent.isFile()) {
      const stat = await fs.stat(full);
      await onFile(full, stat.size);
    }
  }
}

/**
 * @param {number} bytes
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}
