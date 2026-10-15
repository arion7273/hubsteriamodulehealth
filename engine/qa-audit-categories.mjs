/** @typedef {{ id: string, label: string, order: number }} AuditCategory */

export const AUDIT_CATEGORIES = [
  { id: 'functional', label: 'Functional / live URL', order: 1 },
  { id: 'forms', label: 'Forms & workflows', order: 2 },
  { id: 'ui', label: 'UI / responsive', order: 3 },
  { id: 'console_network', label: 'Console / network', order: 4 },
  { id: 'performance', label: 'Performance', order: 5 },
  { id: 'accessibility', label: 'Accessibility', order: 6 },
  { id: 'seo', label: 'SEO & metadata', order: 7 },
  { id: 'security', label: 'Security', order: 8 },
  { id: 'code_quality', label: 'Code quality (repository)', order: 9 },
  { id: 'modules', label: 'Module / filesystem', order: 10 },
  { id: 'other', label: 'Other', order: 99 },
];

/**
 * @param {string} checkId
 */
export function categoryForCheckId(checkId = '') {
  const id = checkId.toLowerCase();
  if (id.startsWith('l3.') || id.includes('workflow') || id.startsWith('frm.')) return 'forms';
  if (id.startsWith('l1.js.') || id.startsWith('l1.network.')) return 'console_network';
  if (id.startsWith('l1.content.') || id.startsWith('l1.readiness.') || id.startsWith('l1.navigation.') || id.startsWith('l1.links.') || id.startsWith('l1.reachability.')) return 'functional';
  if (id.startsWith('l1.')) return 'functional';
  if (id.startsWith('l4.') || id.includes('overflow') || id.includes('viewport')) return 'ui';
  if (id.startsWith('axe') || id.includes('a11y') || id.includes('accessibility')) return 'accessibility';
  if (id.startsWith('lighthouse') || id.includes('perf') || id.startsWith('l5.') || id.startsWith('k6.')) return 'performance';
  if (id.startsWith('l1.content.title') || id.includes('seo') || id.includes('meta')) return 'seo';
  if (id.startsWith('eslint.') || id.startsWith('typescript.') || id.startsWith('vitest.') || id.startsWith('jest.')) return 'code_quality';
  if (id.startsWith('gitleaks.') || id.startsWith('npm-audit.') || id.startsWith('semgrep.') || id.startsWith('zap.') || id.startsWith('sec')) return 'security';
  if (id.startsWith('l2.') || id.startsWith('discovery.')) return 'modules';
  return 'other';
}

export function categoryLabel(categoryId) {
  return AUDIT_CATEGORIES.find((c) => c.id === categoryId)?.label ?? categoryId;
}
