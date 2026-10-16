import fs from 'node:fs';
import path from 'node:path';
import { buildCursorExportPack } from '../engine/cursor-export-bundle.mjs';
import { buildCursorFixPlanPrompt } from '../engine/cursor-fix-prompt.mjs';
import { buildCursorFixAllGapsPrompt } from '../engine/cursor-fix-all-prompt.mjs';
import { DATA_DIR } from './storage.mjs';

function exportDirForRun(runId) {
  return path.join(DATA_DIR, 'exports', runId);
}

/**
 * Write report.json, qa-audit.md, cursor-pack.md under data/exports/{runId}/
 * @param {object} report - normalized report from getRun/executeRun
 * @param {string} [apiBase]
 */
export function persistRunExports(report, apiBase) {
  if (!report?.runId) return null;
  try {
    const dir = exportDirForRun(report.runId);
    fs.mkdirSync(dir, { recursive: true });
    const base = apiBase ?? process.env.MODULE_HEALTH_PUBLIC_URL ?? 'http://127.0.0.1:4177';

    fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(report, null, 2));
    if (report.qaAudit?.markdown) {
      fs.writeFileSync(path.join(dir, 'qa-audit.md'), report.qaAudit.markdown);
    }
    if (report.qaAudit?.html) {
      fs.writeFileSync(path.join(dir, 'qa-audit.html'), report.qaAudit.html);
    }
    fs.writeFileSync(path.join(dir, 'cursor-pack.md'), buildCursorExportPack(report, base));
    fs.writeFileSync(path.join(dir, 'fix-prompt.md'), buildCursorFixPlanPrompt(report));
    fs.writeFileSync(
      path.join(dir, 'fix-all-prompt.md'),
      buildCursorFixAllGapsPrompt(report, { apiBase: base }),
    );

    return dir;
  } catch (err) {
    console.error(`[run-exports] failed for ${report.runId}:`, err);
    return null;
  }
}

export function readExportFile(runId, filename) {
  const file = path.join(exportDirForRun(runId), filename);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8');
}
