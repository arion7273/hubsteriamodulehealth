import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} outDir
 * @param {object} report
 */
export function writeJsonReports(outDir, report) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');

  const gaps = report.findings.filter((f) => f.status === 'fail' || f.status === 'blocked' || f.status === 'skip');
  fs.writeFileSync(path.join(outDir, 'gaps.json'), JSON.stringify({ generatedAt: report.generatedAt, gaps }, null, 2) + '\n', 'utf8');

  const fixes = report.findings
    .filter((f) => f.status === 'fail' && f.fix && f.fix.capability !== 'manual')
    .map((f) => ({
      checkId: f.checkId,
      moduleId: f.moduleId,
      fixId: f.fix.fixId,
      capability: f.fix.capability,
      confidence: f.fix.confidence,
      risk: f.fix.risk,
      title: f.title,
      preview: f.fix.preview,
      cliFix: `node scripts/run-module-health.mjs --fix --check-id=${f.checkId}`,
    }));
  fs.writeFileSync(path.join(outDir, 'fixes.manifest.json'), JSON.stringify({ fixes }, null, 2) + '\n', 'utf8');
}
