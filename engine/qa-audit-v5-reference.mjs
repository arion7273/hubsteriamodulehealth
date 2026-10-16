/**
 * Structure aligned with consultant QA Audit V5 (e.g. HubsteriaBrew QAV5 / 1qa-report-v3-cursor.pdf).
 * Module Health maps automated findings into this outline.
 */

export const QAV5_TEMPLATE_ID = 'qav5';
export const QAV5_TEMPLATE_LABEL = 'Website QA Audit Report — V5';
/** Served from web/public/references/qav5.pdf (HubsteriaBrew consultant re-test V5 reference). */
export const QAV5_REFERENCE_PDF_PATH = '/references/qav5.pdf';
export const QAV5_REFERENCE_TITLE = 'Website QA Audit Report — V5 (Re-test)';

/** @type {{ id: string, label: string, checkIdPrefixes: string[] }[]} */
const QAV5_TESTING_GUIDE = [
  { id: 'tg.reachability', label: 'Entry URL responds (HTTP)', checkIdPrefixes: ['l1.reachability.', 'l1.navigation.'] },
  { id: 'tg.readiness', label: 'Application renders (readiness)', checkIdPrefixes: ['l1.readiness.'] },
  { id: 'tg.content', label: 'Visible content (not blank shell)', checkIdPrefixes: ['l1.content.'] },
  { id: 'tg.js', label: 'No uncaught JavaScript errors', checkIdPrefixes: ['l1.js.'] },
  { id: 'tg.network', label: 'First-party network healthy', checkIdPrefixes: ['l1.network.'] },
  { id: 'tg.links', label: 'Same-origin links (crawl sample)', checkIdPrefixes: ['l1.links.'] },
  { id: 'tg.a11y', label: 'Accessibility (axe)', checkIdPrefixes: ['axe', 'l4.a11y', 'a11y'] },
  { id: 'tg.performance', label: 'Performance / Lighthouse budgets', checkIdPrefixes: ['lighthouse.', 'l4.perf', 'perf'] },
  { id: 'tg.seo', label: 'Title / metadata', checkIdPrefixes: ['l1.content.title', 'seo'] },
  { id: 'tg.security', label: 'Security surface (scoped)', checkIdPrefixes: ['zap.', 'gitleaks.', 'semgrep.', 'sec'] },
];

/** Mirrors HubsteriaBrew QAV5 PDF table of contents (automated sections filled; manual rounds optional). */
export const QAV5_TABLE_OF_CONTENTS = [
  { id: 'executive', label: 'Executive summary', automated: true },
  { id: 'overall-health', label: 'Overall health', automated: true },
  { id: 'top-concerns', label: 'Top 3 concerns', automated: true },
  { id: 'scorecard', label: 'Scorecard', automated: true },
  { id: 'lighthouse', label: 'Lighthouse scores (when ui-a11y pack runs)', automated: 'partial' },
  { id: 'testing-guide', label: 'Testing guide checklist', automated: true },
  { id: 'findings-by-category', label: 'Findings by category', automated: true },
  { id: 'functional', label: 'Functional', automated: true },
  { id: 'forms', label: 'Forms', automated: 'partial' },
  { id: 'ui', label: 'UI / responsive', automated: true },
  { id: 'console_network', label: 'Console / network', automated: true },
  { id: 'performance', label: 'Performance', automated: 'partial' },
  { id: 'accessibility', label: 'Accessibility', automated: true },
  { id: 'seo', label: 'SEO', automated: 'partial' },
  { id: 'security', label: 'Security', automated: 'partial' },
  { id: 'top-fixes', label: 'Prioritized top-10 fix list', automated: true },
  { id: 'appendix-a', label: 'Appendix A — Pages tested', automated: true },
  { id: 'appendix-b', label: 'Appendix B — Viewports and devices', automated: 'partial' },
  { id: 'appendix-c', label: 'Appendix C — Tools used', automated: true },
  { id: 'appendix-d', label: 'Appendix D — How testing was done', automated: true },
  { id: 'appendix-f', label: 'Appendix F — Testing limitations', automated: true },
];

/**
 * @param {object[]} findings
 */
export function buildTestingGuideChecklist(findings) {
  const byCheck = new Map(findings.map((f) => [f.checkId, f]));
  return QAV5_TESTING_GUIDE.map((row) => {
    const matched = findings.filter((f) =>
      row.checkIdPrefixes.some((p) => (f.checkId ?? '').startsWith(p) || (f.checkId ?? '').includes(p)),
    );
    let status = 'not_tested';
    if (matched.some((f) => f.status === 'fail')) status = 'fail';
    else if (matched.some((f) => f.status === 'blocked')) status = 'blocked';
    else if (matched.length && matched.every((f) => f.status === 'pass' || f.status === 'not_applicable')) status = 'pass';
    else if (matched.length) status = 'partial';
    return {
      id: row.id,
      label: row.label,
      status,
      checkIds: matched.map((f) => f.checkId),
    };
  });
}

/**
 * @param {string} [targetUrl]
 * @param {string} [appName]
 * @param {string} [appId]
 */
export function resolveAuditSiteName(targetUrl, appName, appId) {
  if (appId === 'adhoc-url-scan' && targetUrl) {
    try {
      const u = new URL(targetUrl);
      return u.hostname.replace(/^www\./, '');
    } catch {
      /* fall through */
    }
  }
  return appName ?? 'Site under test';
}
