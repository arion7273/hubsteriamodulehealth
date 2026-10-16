import fs from 'node:fs/promises';
import path from 'node:path';
import { readInstalledVersion } from '../core/meta.mjs';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { runCommand, scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runTypeScriptScanner(config) {
  const start = Date.now();
  const { cwd, command, label } = config.typescript;
  try {
    await fs.access(path.join(cwd, 'tsconfig.json'));
  } catch {
    return scannerResult('typescript', `TypeScript (${label})`, 'skipped', {
      skipReason: 'No tsconfig in configured target',
    });
  }

  const [cmd, ...args] = command;
  try {
    const { code, stdout, stderr } = await runCommand(cmd, args, { cwd });
    const output = `${stdout}\n${stderr}`.trim();
    if (code === 0) {
      return scannerResult('typescript', `TypeScript (${label})`, 'completed', {
        durationMs: Date.now() - start,
        version: readInstalledVersion('typescript') ?? 'fixture-local',
        findings: [],
        raw: { exitCode: 0 },
      });
    }

    const findings = parseTscOutput(output, config.repoRoot, cwd);
    return scannerResult('typescript', `TypeScript (${label})`, 'completed', {
      durationMs: Date.now() - start,
      version: readInstalledVersion('typescript') ?? 'fixture-local',
      findings,
      raw: { exitCode: code, output: output.slice(0, 2000) },
    });
  } catch (err) {
    return scannerResult('typescript', `TypeScript (${label})`, 'failed', {
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {string} output
 * @param {string} repoRoot
 * @param {string} cwd
 */
function parseTscOutput(output, repoRoot, cwd) {
  const findings = [];
  const lineRe = /^(.*)\((\d+),(\d+)\): error (TS\d+): (.*)$/gm;
  let m;
  while ((m = lineRe.exec(output))) {
    const relFile = path.relative(repoRoot, path.join(cwd, m[1]));
    const fp = fingerprint(['tsc', relFile, m[2], m[4], m[5]].join('|'));
    findings.push({
      id: stableFindingId('TS', fp),
      category: 'typescript',
      priority: 'high',
      confidence: 'high',
      cleanupRisk: 'low',
      locations: [{ file: relFile, line: Number(m[2]) }],
      scanner: 'typescript',
      evidence: { code: m[4], message: m[5] },
      summary: `TypeScript ${m[4]}: ${m[5]}`,
      whyItMatters: 'Type errors block strict quality gates for repository-scanned apps.',
      proposedChange: 'Fix types in fixture or mirror fix in adapter targets.',
      affectedWorkflows: ['code-quality pack', 'verify:adapters'],
      verificationRequired: ['npm run typecheck in fixture', 'npm run verify:adapters'],
      status: 'open',
      fingerprint: fp,
    });
  }
  return findings;
}
