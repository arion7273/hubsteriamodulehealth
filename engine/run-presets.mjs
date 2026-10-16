/**
 * Registered run presets for build / release-style verification.
 * @typedef {{ id: string, label: string, description: string, inputMode: 'url'|'html'|'repository', packs?: string[], levels?: number[], requiresRepositoryPath?: boolean, companionPresetId?: string }} RunPreset
 */

/** @type {Record<string, RunPreset>} */
export const RUN_PRESETS = {
  'any-url-qa-audit': {
    id: 'any-url-qa-audit',
    label: 'Any URL — QA audit (landing default)',
    description:
      'Full URL audit for paste-any-URL flows: quick health + UI/a11y. Produces QAV5-style report export (HTML/PDF).',
    inputMode: 'url',
    packs: ['quick-health', 'ui-a11y'],
    levels: [1, 4],
  },
  'comprehensive-build-url': {
    id: 'comprehensive-build-url',
    label: 'Comprehensive build verification (live URL)',
    description:
      'All URL/browser tools: Playwright quick health (L1) + axe & Lighthouse (ui-a11y / L4). Does not run ESLint, tests, or secrets — pair with comprehensive-build-repo.',
    inputMode: 'url',
    packs: ['quick-health', 'ui-a11y'],
    levels: [1, 2, 4],
    companionPresetId: 'comprehensive-build-repo',
  },
  'comprehensive-build-repo': {
    id: 'comprehensive-build-repo',
    label: 'Comprehensive build verification (repository)',
    description: 'ESLint, TypeScript, unit tests, Semgrep, Gitleaks, and dependency audit on a checkout path.',
    inputMode: 'repository',
    packs: ['code-quality', 'security'],
    levels: [2],
    requiresRepositoryPath: true,
    companionPresetId: 'comprehensive-build-url',
  },
};

export function listRunPresets() {
  return Object.values(RUN_PRESETS);
}

function getRunPreset(id) {
  return RUN_PRESETS[id] ?? null;
}

export function presetToRunTestQuery(appId, presetId) {
  const p = getRunPreset(presetId);
  if (!p) return `/run?app=${encodeURIComponent(appId)}`;
  const params = new URLSearchParams({ app: appId, preset: presetId, inputMode: p.inputMode });
  if (p.packs?.length) params.set('packs', p.packs.join(','));
  if (p.levels?.length) params.set('levels', p.levels.join(','));
  return `/run?${params.toString()}`;
}
