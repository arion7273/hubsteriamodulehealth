/** @typedef {'url'|'html'|'repository'} InputMode */

export const PACK_DEFINITIONS = {
  'quick-health': {
    label: 'Quick Health',
    description: 'Playwright readiness, routes, console, network, assets',
    inputModes: ['url', 'html'],
    adapters: ['playwright-live'],
    playwrightLevels: [1],
  },
  'ui-a11y': {
    label: 'UI & Accessibility',
    description: 'Responsive checks, axe-core, Lighthouse budgets',
    inputModes: ['url', 'html'],
    adapters: ['playwright-live', 'axe-core', 'lighthouse'],
    playwrightLevels: [4],
  },
  workflow: {
    label: 'Workflow',
    description: 'Configured Playwright recipes (requires setup)',
    inputModes: ['url'],
    adapters: ['playwright-live'],
    playwrightLevels: [3],
  },
  'code-quality': {
    label: 'Code Quality',
    description: 'ESLint, TypeScript, Vitest using target repo config',
    inputModes: ['repository'],
    adapters: ['eslint', 'typescript', 'vitest', 'semgrep'],
  },
  security: {
    label: 'Security',
    description: 'Gitleaks, npm audit, Semgrep, scoped ZAP passive',
    inputModes: ['repository', 'url'],
    adapters: ['gitleaks', 'npm-audit', 'semgrep', 'zap'],
  },
  'load-recovery': {
    label: 'Load & Recovery',
    description: 'k6 scenarios and recovery recipes (staging, opt-in)',
    inputModes: ['url'],
    adapters: ['k6'],
  },
};

export function packsForInputMode(inputMode) {
  return Object.entries(PACK_DEFINITIONS)
    .filter(([, def]) => def.inputModes.includes(inputMode))
    .map(([id]) => id);
}

export function validatePacksForInput(packs, inputMode) {
  const invalid = packs.filter((p) => {
    const def = PACK_DEFINITIONS[p];
    return !def || !def.inputModes.includes(inputMode);
  });
  return invalid;
}
