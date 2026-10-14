import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} outDir
 * @param {object} report
 */
export function writeMarkdownReport(outDir, report) {
  const lines = [];
  lines.push('# Module Health Report');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');
  lines.push(`## Gate: **${report.gate}**`);
  lines.push('');
  lines.push('### Summary');
  lines.push('');
  lines.push('| Status | Count |');
  lines.push('|--------|------:|');
  for (const [k, v] of Object.entries(report.summary.counts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push('');
  lines.push('### Auto-fixable failures');
  lines.push('');
  const auto = report.findings.filter((f) => f.status === 'fail' && f.fix?.capability === 'auto');
  if (!auto.length) lines.push('_None_');
  else {
    for (const f of auto) {
      const cmd = `npm run module:health -- --fix --check-id=${f.checkId}`;
      lines.push(`- **${f.checkId}** (${f.moduleId}): ${f.title}`);
      lines.push(`  - Fix: \`${f.fix.fixId}\` — ${f.fix.preview ?? ''}`);
      lines.push(`  - **Fix button (CLI):** \`${cmd}\``);
      if (f.remediation?.summary) lines.push(`  - Remediation: ${f.remediation.summary}`);
    }
  }
  lines.push('');
  lines.push('### Failures (all)');
  lines.push('');
  const fails = report.findings.filter((f) => f.status === 'fail');
  if (!fails.length) lines.push('_None_');
  else {
    lines.push('| Module | Check | Severity | Title |');
    lines.push('|--------|-------|----------|-------|');
    for (const f of fails) {
      lines.push(`| ${f.moduleId} | ${f.checkId} | ${f.severity} | ${f.title} |`);
    }
  }
  lines.push('');
  lines.push('### Blocked');
  lines.push('');
  const blocked = report.findings.filter((f) => f.status === 'blocked');
  if (!blocked.length) lines.push('_None_');
  else {
    for (const f of blocked) {
      lines.push(`- **${f.checkId}**: ${f.detail ?? f.title}`);
    }
  }
  lines.push('');
  lines.push('### Per-module scorecard');
  lines.push('');
  for (const mod of report.modules) {
    lines.push(`#### ${mod.moduleId}`);
    lines.push(`- Pass rate: ${mod.passRate}% (${mod.pass}/${mod.total})`);
    if (mod.byCategory) {
      for (const [cat, stats] of Object.entries(mod.byCategory)) {
        lines.push(`  - ${cat}: ${stats.pass}/${stats.total}`);
      }
    }
    lines.push('');
  }
  lines.push('### Full check matrix');
  lines.push('');
  lines.push('| Layer | Check | Status |');
  lines.push('|-------|-------|--------|');
  for (const f of report.findings) {
    lines.push(`| ${f.layer} | ${f.checkId} | ${f.status} |`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'REPORT.md'), lines.join('\n') + '\n', 'utf8');
}
