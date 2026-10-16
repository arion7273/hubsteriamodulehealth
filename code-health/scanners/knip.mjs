import fs from 'node:fs/promises';
import path from 'node:path';
import { readInstalledVersion } from '../core/meta.mjs';
import { fingerprint, stableFindingId } from '../core/finding-id.mjs';
import { runCommand, scannerResult } from './util.mjs';

/**
 * @param {import('../core/types.mjs').CodeHealthRepoConfig} config
 */
export async function runKnipScanner(config) {
  const version = readInstalledVersion('knip', config.repoRoot);
  if (!version) {
    return scannerResult('knip', 'Knip (unused files/exports/deps)', 'unavailable', {
      skipReason: 'knip not installed; run npm install',
    });
  }

  const start = Date.now();
  const scratch = path.join(config.reportsDir, 'scratch', 'knip');
  await fs.mkdir(scratch, { recursive: true });
  const knipConfigPath = path.join(scratch, 'knip.json');
  await fs.writeFile(
    knipConfigPath,
    JSON.stringify(
      {
        $schema: 'https://unpkg.com/knip@6/schema.json',
        workspaces: {
          '.': {
            entry: config.knip.entry.filter((e) => !e.startsWith('web/')),
            project: config.knip.project.filter((p) => !p.startsWith('web/')),
            ignore: config.exclusions.knip,
            ignoreDependencies: [...config.knip.ignoreDependencies, 'jscpd', 'knip'],
            ignoreBinaries: config.knip.ignoreBinaries,
          },
          web: {
            entry: ['src/main.jsx'],
            project: ['src/**/*.{js,jsx}'],
            paths: {
              '@engine/*': ['../engine/*'],
              '@registry/*': ['../registry/*'],
            },
          },
        },
      },
      null,
      2,
    ),
    'utf8',
  );

  const knipBin = path.join(config.repoRoot, 'node_modules', 'knip', 'bin', 'knip.js');
  try {
    const { code, stdout, stderr } = await runCommand(process.execPath, [knipBin, '--config', knipConfigPath, '--reporter', 'json'], {
      cwd: config.repoRoot,
    });

    let raw;
    try {
      const jsonStart = stdout.indexOf('{');
      raw = JSON.parse(jsonStart >= 0 ? stdout.slice(jsonStart) : stdout);
    } catch {
      return scannerResult('knip', 'Knip (unused files/exports/deps)', 'failed', {
        durationMs: Date.now() - start,
        version,
        error: `Invalid knip JSON: ${(stderr || stdout).slice(0, 600)}`,
      });
    }

    const findings = [];
    for (const issue of raw.issues ?? []) {
      for (const file of issue.files ?? []) {
        addKnipFinding(findings, config.repoRoot, 'files', file.name ?? file, issue, 'unused-code', 'high');
      }
      for (const exp of issue.exports ?? []) {
        addKnipFinding(findings, config.repoRoot, 'exports', exp, issue, 'unused-code', 'medium');
      }
      for (const dep of issue.dependencies ?? []) {
        addKnipFinding(findings, config.repoRoot, 'dependencies', dep, issue, 'unused-dependency', 'medium');
      }
      for (const dep of issue.devDependencies ?? []) {
        addKnipFinding(findings, config.repoRoot, 'devDependencies', dep, issue, 'unused-dependency', 'low');
      }
      for (const dep of issue.unlisted ?? []) {
        addKnipFinding(findings, config.repoRoot, 'unlisted', dep, issue, 'maintenance', 'low');
      }
    }

    return scannerResult('knip', 'Knip (unused files/exports/deps)', 'completed', {
      durationMs: Date.now() - start,
      version,
      findings,
      raw: { issueCount: raw.issues?.length ?? 0, exitCode: code },
    });
  } catch (err) {
    return scannerResult('knip', 'Knip (unused files/exports/deps)', 'failed', {
      durationMs: Date.now() - start,
      version,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * @param {import('../core/types.mjs').CodeHealthFinding[]} findings
 * @param {string} repoRoot
 * @param {string} issueType
 * @param {object|string} item
 * @param {object} parentIssue
 * @param {import('../core/types.mjs').FindingCategory} category
 * @param {import('../core/types.mjs').FindingPriority} priority
 */
function addKnipFinding(findings, repoRoot, issueType, item, parentIssue, category, priority) {
  const name = typeof item === 'string' ? item : item.name;
  const parentFile = parentIssue.file ?? '';
  const relParent = parentFile ? path.relative(repoRoot, parentFile) : parentFile;
  const line = typeof item === 'object' ? item.line : undefined;
  const fp = fingerprint(['knip', issueType, relParent, name, String(line ?? '')].join('|'));
  const prefix = category === 'unused-dependency' ? 'DEPS' : category === 'unused-code' ? 'UNUSED' : 'MAINT';
  findings.push({
    id: stableFindingId(prefix, fp),
    category,
    priority,
    confidence: issueType === 'files' ? 'high' : 'medium',
    cleanupRisk: issueType === 'dependencies' || issueType === 'devDependencies' ? 'medium' : 'high',
    locations: [{ file: relParent || name, line }],
    scanner: 'knip',
    evidence: { issueType, item, parentFile: relParent },
    summary: `Knip ${issueType}: ${name}${relParent ? ` (from ${relParent})` : ''}`,
    whyItMatters:
      category === 'unused-dependency'
        ? 'Unused dependencies increase install size and audit surface.'
        : category === 'maintenance'
          ? 'Unlisted imports may indicate missing package.json entries or workspace misconfiguration.'
          : 'Unused files/exports add navigation noise and may hide dead routes or workers.',
    proposedChange:
      category === 'unused-dependency'
        ? 'Remove dependency if no dynamic/runtime import; re-run npm test.'
        : category === 'maintenance'
          ? 'Declare dependency in the correct package.json workspace or fix import path.'
          : 'Delete or wire entry; check dynamic imports and runtime registration.',
    affectedWorkflows: ['npm install', 'CI verify scripts', 'production bundle'],
    verificationRequired: ['npm test', 'npm run build:web'],
    status: 'open',
    fingerprint: fp,
  });
}
