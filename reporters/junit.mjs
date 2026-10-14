import fs from 'node:fs';
import path from 'node:path';

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} outDir
 * @param {object} report
 */
export function writeJunitReport(outDir, report) {
  const cases = report.findings;
  const failures = cases.filter((f) => f.status === 'fail').length;
  const xml = [];
  xml.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  xml.push(`<testsuite name="module-health" tests="${cases.length}" failures="${failures}">`);
  for (const f of cases) {
    const name = `${f.moduleId}::${f.checkId}`;
    if (f.status === 'fail') {
      xml.push(`  <testcase classname="${escapeXml(f.moduleId)}" name="${escapeXml(f.checkId)}">`);
      xml.push(`    <failure message="${escapeXml(f.title)}">${escapeXml(f.detail ?? '')}</failure>`);
      xml.push(`  </testcase>`);
    } else if (f.status === 'skip' || f.status === 'blocked') {
      xml.push(`  <testcase classname="${escapeXml(f.moduleId)}" name="${escapeXml(f.checkId)}">`);
      xml.push(`    <skipped message="${escapeXml(f.detail ?? f.status)}"/>`);
      xml.push(`  </testcase>`);
    } else {
      xml.push(`  <testcase classname="${escapeXml(f.moduleId)}" name="${escapeXml(f.checkId)}"/>`);
    }
  }
  xml.push(`</testsuite>`);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'report.junit.xml'), xml.join('\n') + '\n', 'utf8');
}
