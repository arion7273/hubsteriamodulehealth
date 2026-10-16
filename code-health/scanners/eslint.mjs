import fs from 'node:fs/promises';
import path from 'node:path';
import { readInstalledVersion } from '../core/meta.mjs';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { runCommand, scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runEslintScanner(config) {
  const start = Date.now();
  const { cwd, label } = config.eslint;
  try {
    await fs.access(path.join(cwd, 'package.json'));
  } catch {
    return scannerResult('eslint', `ESLint (${label})`, 'skipped', {
      skipReason: 'ESLint target package.json missing',
    });
  }

  try {
    const eslintBin = path.join(cwd, 'node_modules', 'eslint', 'bin', 'eslint.js');
    const { code, stdout, stderr } = await runCommand(process.execPath, [eslintBin, 'src', '-f', 'json'], {
      cwd,
    });
    let data = [];
    try {
      data = JSON.parse(stripNpmNoise(stdout) || '[]');
    } catch {
      return scannerResult('eslint', `ESLint (${label})`, 'failed', {
        durationMs: Date.now() - start,
        error: `Non-JSON ESLint output: ${(stderr || stdout).slice(0, 300)}`,
      });
    }

    const findings = [];
    for (const file of data) {
      for (const msg of file.messages ?? []) {
        if (msg.severity < 2) continue;
        const relFile = path.relative(config.repoRoot, path.join(cwd, file.filePath));
        const fp = fingerprint(['eslint', relFile, msg.line, msg.ruleId, msg.message].join('|'));
        findings.push({
          id: stableFindingId('LINT', fp),
          category: 'lint',
          priority: 'medium',
          confidence: 'high',
          cleanupRisk: 'low',
          locations: [{ file: relFile, line: msg.line, endLine: msg.endLine }],
          scanner: 'eslint',
          evidence: { ruleId: msg.ruleId, message: msg.message, severity: msg.severity },
          summary: `ESLint ${msg.ruleId ?? 'error'}: ${msg.message}`,
          whyItMatters: 'Lint errors in fixture repos mirror patterns that may exist in production adapters.',
          proposedChange: msg.fix ? 'Apply ESLint fix; run fixture test suite.' : 'Resolve rule violation manually.',
          affectedWorkflows: ['verify:adapters', 'code-quality pack'],
          verificationRequired: ['npm run verify:adapters'],
          status: 'open',
          fingerprint: fp,
        });
      }
    }

    return scannerResult('eslint', `ESLint (${label})`, 'completed', {
      durationMs: Date.now() - start,
      version: readInstalledVersion('eslint') ?? 'fixture-local',
      findings,
      raw: { exitCode: code, fileCount: data.length },
    });
  } catch (err) {
    return scannerResult('eslint', `ESLint (${label})`, 'failed', {
      durationMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {string} stdout
 */
function stripNpmNoise(stdout) {
  const idx = stdout.indexOf('[{');
  if (idx >= 0) return stdout.slice(idx);
  const objIdx = stdout.indexOf('[');
  return objIdx >= 0 ? stdout.slice(objIdx) : stdout;
}
