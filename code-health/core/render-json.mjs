import fs from 'node:fs/promises';

/**
 * @param {import('./types.mjs').AuditReport} report
 * @param {string} outPath
 */
export async function renderJsonReport(report, outPath) {
  await fs.writeFile(outPath, JSON.stringify(report, null, 2), 'utf8');
}
