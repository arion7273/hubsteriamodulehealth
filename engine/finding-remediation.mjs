const CHECK_HINTS = [
  { prefix: 'l1.readiness.', summary: 'Fix rendered page readiness — auth gate, blank shell, or missing content at the entry URL.' },
  { prefix: 'l1.js.', summary: 'Fix uncaught JavaScript errors shown in the browser console for this route.' },
  { prefix: 'l1.links.', summary: 'Repair broken same-origin links or widen crawl scope after readiness passes.' },
  { prefix: 'l1.network.', summary: 'Fix failing first-party network requests (4xx/5xx or blocked assets).' },
  { prefix: 'l1.navigation.', summary: 'Ensure the target URL loads with an acceptable HTTP status and redirect chain.' },
  { prefix: 'eslint.', summary: 'Resolve ESLint violations in the repository using the project config.' },
  { prefix: 'typescript.', summary: 'Fix TypeScript compile errors reported by tsc.' },
  { prefix: 'vitest.', summary: 'Fix failing unit/component tests; re-run Vitest locally.' },
  { prefix: 'gitleaks.', summary: 'Remove or rotate exposed secrets; add patterns to allowlist only if false positive.' },
  { prefix: 'npm-audit.', summary: 'Upgrade or patch dependencies to clear high/critical advisories.' },
  { prefix: 'axe-core.', summary: 'Fix accessibility violations reported by axe for this page.' },
  { prefix: 'lighthouse.', summary: 'Address Lighthouse performance, a11y, or best-practice regressions.' },
];

import { getFixPlaybook } from './fix-playbooks.mjs';

const AXE_RULE_HINTS = {
  'axe.rule.color-contrast': {
    summary:
      'Raise text/background contrast to WCAG AA (4.5:1 normal text, 3:1 large). Update theme tokens, button styles, and muted foreground colors — not just one hero line.',
    steps: [
      'Open the failing selectors in DevTools and note foreground/background computed colors.',
      'Fix CSS/Tailwind classes on marketing sections, CTAs, and footer links called out in evidence.',
      'Re-run the same URL scan after deploy.',
    ],
  },
  'axe.rule.region': {
    summary:
      'Ensure all visible content sits inside landmarks (`<main>`, `<nav>`, `<header>`, `<footer>`, or roles). Orphan nodes usually mean content outside `<main>` or a missing main landmark.',
    steps: [
      'Wrap primary page content in a single `<main>` (or `role="main"`).',
      'Move stray sections/divs that sit as direct children of `<body>` into appropriate landmarks.',
      'Re-run axe on the entry URL.',
    ],
  },
};

/**
 * @param {object} f
 * @returns {object}
 */
export function ensureFindingRemediation(f) {
  const axeHint = AXE_RULE_HINTS[f.checkId ?? ''];
  if (f.remediation?.summary && !axeHint) return f;
  if (f.status !== 'fail' && f.status !== 'blocked' && f.status !== 'not_tested') return f;

  const checkId = f.checkId ?? '';
  const hint = CHECK_HINTS.find((h) => checkId.startsWith(h.prefix));
  const summary =
    axeHint?.summary ??
    hint?.summary ??
    (f.status === 'blocked' || f.status === 'not_tested'
      ? (f.detail ?? f.actual ?? 'Resolve prerequisites and re-run the same scope.')
      : 'Investigate the observed vs expected outcome and re-run this check.');

  const pb = getFixPlaybook({ ...f, remediation: { summary, steps: f.remediation?.steps } });
  const steps = [...new Set([...(f.remediation?.steps ?? []), ...(axeHint?.steps ?? []), ...pb.steps])];

  return {
    ...f,
    remediation: {
      summary,
      steps,
    },
  };
}
