import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { readInstalledVersion } from '../core/meta.mjs';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { runCommand, scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runJscpdScanner(config) {
  const version = readInstalledVersion('jscpd', config.repoRoot);
  if (!version) {
    return scannerResult('jscpd', 'jscpd (duplicate blocks)', 'unavailable', {
      skipReason: 'jscpd not installed; run npm install',
    });
  }

  const start = Date.now();
  const outDir = path.join(config.reportsDir, 'scratch', 'jscpd');
  await fs.mkdir(outDir, { recursive: true });

  const jscpdBin = path.join(config.repoRoot, 'node_modules', 'jscpd', 'run-jscpd.js');
  const args = [
    jscpdBin,
    ...config.jscpd.paths.map((p) => path.join(config.repoRoot, p)),
    '--min-lines',
    String(config.jscpd.minLines),
    '--min-tokens',
    String(config.jscpd.minTokens),
    '--format',
    config.jscpd.format.join(','),
    '--ignore',
    config.exclusions.jscpd.join(','),
    '--reporters',
    'json',
    '--output',
    outDir,
    '--silent',
  ];

  try {
    const { code, stdout, stderr } = await runCommand(process.execPath, args, { cwd: config.repoRoot });
    const jsonPath = path.join(outDir, 'jscpd-report.json');
    let raw;
    try {
      raw = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    } catch {
      return scannerResult('jscpd', 'jscpd (duplicate blocks)', 'failed', {
        durationMs: Date.now() - start,
        version,
        error: `No JSON report (exit ${code}): ${stderr || stdout}`.slice(0, 500),
      });
    }

    const findings = [];
    for (const dup of raw.duplicates ?? []) {
      const first = dup.firstFile;
      const second = dup.secondFile;
      const fp = fingerprint(
        ['jscpd', first?.name, first?.start, second?.name, second?.start, dup.lines].join('|'),
      );
      findings.push({
        id: stableFindingId('DUP', fp),
        category: 'duplication',
        priority: dup.lines >= 20 ? 'high' : 'medium',
        confidence: 'high',
        cleanupRisk: 'medium',
        locations: [
          {
            file: resolveJscpdFile(config, first?.name),
            line: first?.start,
            endLine: first?.end,
          },
          {
            file: resolveJscpdFile(config, second?.name),
            line: second?.start,
            endLine: second?.end,
          },
        ],
        scanner: 'jscpd',
        evidence: { lines: dup.lines, tokens: dup.tokens, fragment: dup.fragment?.slice(0, 200) },
        summary: `Duplicate block (${dup.lines} lines) between ${resolveJscpdFile(config, first?.name)} and ${resolveJscpdFile(config, second?.name)}`,
        whyItMatters:
          'Repeated text increases maintenance cost and can hide divergent business behavior if copies drift.',
        proposedChange: 'Extract shared helper/module; confirm both call sites need identical behavior.',
        affectedWorkflows: ['module-health CLI', 'scan runners', 'report pipeline'],
        verificationRequired: ['npm test', 'npm run verify:platform'],
        status: 'open',
        fingerprint: fp,
      });
    }

    return scannerResult('jscpd', 'jscpd (duplicate blocks)', 'completed', {
      durationMs: Date.now() - start,
      version,
      findings,
      raw: { duplicateCount: findings.length, statistics: raw.statistics },
    });
  } catch (err) {
    return scannerResult('jscpd', 'jscpd (duplicate blocks)', 'failed', {
      durationMs: Date.now() - start,
      version,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * jscpd reports paths relative to each scanned root directory.
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 * @param {string} [file]
 */
function resolveJscpdFile(config, file) {
  if (!file) return '(unknown)';
  if (path.isAbsolute(file)) return path.relative(config.repoRoot, file);
  const normalized = file.replace(/\\/g, '/');
  for (const scanRoot of config.jscpd.paths) {
    const candidate = path.join(scanRoot, normalized).replace(/\\/g, '/');
    const abs = path.join(config.repoRoot, candidate);
    if (fsSync.existsSync(abs)) return candidate;
  }
  return path.join(config.jscpd.paths[0], normalized).replace(/\\/g, '/');
}
