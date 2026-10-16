import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildAuditMeta, defaultReportPaths } from './meta.mjs';
import { normalizeFindings } from './normalize-findings.mjs';
import { renderJsonReport } from './render-json.mjs';
import { renderHtmlReport } from './render-html.mjs';
import { writeBacklogMarkdown } from './backlog-md.mjs';
import { runJscpdScanner } from '../scanners/jscpd.mjs';
import { runKnipScanner } from '../scanners/knip.mjs';
import { runEslintScanner } from '../scanners/eslint.mjs';
import { runTypeScriptScanner } from '../scanners/typescript.mjs';
import { runAssetsScanner } from '../scanners/assets.mjs';
import { runBundleScanner } from '../scanners/bundle.mjs';

const SCHEMA_VERSION = '1.0.0';

/**
 * @param {import('./types.mjs').CodeHealthRepoConfig} config
 * @param {{ skipBundle?: boolean, previousFindings?: Map<string, import('./types.mjs').CodeHealthFinding> }} [opts]
 */
export async function runCodeHealthAudit(config, opts = {}) {
  await fs.mkdir(config.reportsDir, { recursive: true });
  const meta = await buildAuditMeta(config);

  const scanners = [];
  scanners.push(await runJscpdScanner(config));
  scanners.push(await runKnipScanner(config));
  scanners.push(await runEslintScanner(config));
  scanners.push(await runTypeScriptScanner(config));
  scanners.push(await runAssetsScanner(config));
  if (!opts.skipBundle) {
    scanners.push(await runBundleScanner(config));
  } else {
    scanners.push({
      id: 'bundle',
      name: 'Vite production bundle',
      status: 'skipped',
      durationMs: 0,
      skipReason: 'skipBundle option',
      findings: [],
    });
  }

  const findings = normalizeFindings(scanners, opts.previousFindings);

  /** @type {import('./types.mjs').AuditReport} */
  const report = {
    schemaVersion: SCHEMA_VERSION,
    reportId: randomUUID(),
    meta,
    scanners,
    findings,
  };

  const paths = defaultReportPaths(config.reportsDir);
  await renderJsonReport(report, paths.json);
  await renderJsonReport(report, paths.latestJson);
  await renderHtmlReport(report, paths.html);
  await renderHtmlReport(report, paths.latestHtml);
  await writeBacklogMarkdown(report, config.backlogPath);

  return { report, paths };
}

/**
 * @param {import('./types.mjs').CodeHealthRepoConfig} config
 */
export async function loadBaseline(config) {
  const baselinePath = path.join(config.reportsDir, config.baselineFileName);
  try {
    const raw = await fs.readFile(baselinePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
