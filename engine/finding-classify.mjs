/** @typedef {'app_defect'|'runner_failure'|'review'|'informational'} FindingOutcomeKind */

const RUNNER_CHECK_PREFIXES = [
  'run.',
  'repo.',
  'packs.',
  'eslint.',
  'typescript.',
  'vitest.',
  'gitleaks.',
  'npm-audit.',
  'semgrep.',
  'zap.',
  'k6.',
  'lighthouse.',
  'axe-core.',
  'playwright.',
];

const RUNNER_CHECK_SUFFIXES = ['.preflight', '.crash', '.input-mode'];

/**
 * Classify a finding for report sections (not for changing pass/fail).
 * @param {object} f
 * @returns {FindingOutcomeKind}
 */
export function classifyFindingOutcome(f) {
  if (f.status === 'pass' || f.status === 'not_applicable') return 'informational';
  const checkId = f.checkId ?? '';

  if (f.status === 'blocked') {
    if (checkId.startsWith('l1.') || checkId.startsWith('l2.') || checkId.startsWith('l3.') || checkId.startsWith('l4.')) {
      return 'app_defect';
    }
    return 'runner_failure';
  }

  const isRunner =
    RUNNER_CHECK_SUFFIXES.some((s) => checkId.endsWith(s)) ||
    RUNNER_CHECK_PREFIXES.some((p) => checkId.startsWith(p)) ||
    f.meta?.tool === 'runner' ||
    (f.title && /runner crashed|not available/i.test(f.title));

  if (f.status === 'fail' && isRunner) return 'runner_failure';
  if (f.status === 'fail' && checkId.startsWith('axe.')) return 'app_defect';
  if (f.status === 'fail' && checkId.startsWith('l1.')) {
    return f.severity === 'medium' || f.severity === 'low' ? 'review' : 'app_defect';
  }
  if (f.status === 'fail' && (f.severity === 'blocker' || f.severity === 'high')) return 'app_defect';
  if (f.status === 'fail') return 'review';
  if (f.status === 'not_tested' || f.status === 'skip' || f.status === 'not_started') return 'informational';
  return 'informational';
}

