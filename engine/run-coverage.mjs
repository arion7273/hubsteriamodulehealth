import { PACK_DEFINITIONS, packsForInputMode } from './packs/definitions.mjs';

const BUILD_CATEGORIES = [
  {
    id: 'live-url-health',
    label: 'Live URL health (Playwright L1)',
    requires: { inputModes: ['url', 'html'], levels: [1], packs: ['quick-health'] },
  },
  {
    id: 'ui-a11y',
    label: 'UI quality & accessibility (axe, Lighthouse, L4)',
    requires: { inputModes: ['url', 'html'], levels: [4], packs: ['ui-a11y'] },
  },
  {
    id: 'module-inventory',
    label: 'Module inventory & filesystem gates (L2)',
    requires: { inputModes: ['url', 'html', 'repository'], levels: [2] },
  },
  {
    id: 'workflows',
    label: 'Critical workflows (L3 recipes)',
    requires: { inputModes: ['url'], levels: [3], packs: ['workflow'] },
  },
  {
    id: 'code-quality',
    label: 'Repository code quality (ESLint, TypeScript, unit tests)',
    requires: { inputModes: ['repository'], packs: ['code-quality'] },
  },
  {
    id: 'security',
    label: 'Security scanners (secrets, audit, Semgrep, passive ZAP)',
    requires: { inputModes: ['repository', 'url'], packs: ['security'] },
  },
  {
    id: 'load-recovery',
    label: 'Load & recovery (k6, staging only)',
    requires: { inputModes: ['url'], packs: ['load-recovery'], levels: [5] },
  },
];

function levelsRun(runRequest) {
  return runRequest.levels ?? [1];
}

function packsRun(runRequest) {
  const explicit = (runRequest.packs ?? []).filter((p) => !/^level-\d+$/.test(p));
  if (explicit.length) return explicit;
  const levels = levelsRun(runRequest);
  return inferPacksFromLevels(levels);
}

export function inferPacksFromLevels(levels) {
  const inferred = [];
  if (levels.includes(1)) inferred.push('quick-health');
  if (levels.includes(4)) inferred.push('ui-a11y');
  if (levels.includes(3)) inferred.push('workflow');
  if (levels.includes(5)) inferred.push('load-recovery');
  return inferred;
}

/** Levels represented by selected packs (for report metadata when levels omitted). */
export function inferLevelsFromPacks(packs) {
  const levels = [];
  if (packs.includes('quick-health')) levels.push(1);
  if (packs.includes('code-quality')) levels.push(2);
  if (packs.includes('workflow')) levels.push(3);
  if (packs.includes('ui-a11y')) levels.push(4);
  if (packs.includes('load-recovery')) levels.push(5);
  if (packs.includes('security')) levels.push(2);
  return [...new Set(levels)].sort((a, b) => a - b);
}

/**
 * Resolve pack ids for coverage/profile (ignores legacy `level-N` placeholders).
 * @param {object} runRequest
 */
export function resolvePacksExecuted(runRequest) {
  const executed = runRequest.packsExecuted ?? [];
  const fromExecuted = executed.filter((p) => !String(p).startsWith('level-'));
  if (fromExecuted.length) return fromExecuted;
  if (runRequest.packs?.length) return runRequest.packs;
  return packsRun(runRequest);
}

function categoryRan(cat, inputMode, levels, packs) {
  const r = cat.requires;
  if (r.packs?.length && packs.some((p) => r.packs.includes(p))) return true;
  if (r.levels?.length && levels.some((l) => r.levels.includes(l))) {
    if (r.inputModes && !r.inputModes.includes(inputMode)) return false;
    if (cat.id === 'code-quality' || cat.id === 'security') return false;
    return true;
  }
  if (cat.id === 'code-quality' && inputMode === 'repository' && packs.includes('code-quality')) return true;
  if (cat.id === 'security' && packs.includes('security')) return true;
  return false;
}

function skipReason(cat, inputMode, app) {
  if (cat.id === 'code-quality') {
    if (inputMode !== 'repository') {
      return 'Requires **repository** input mode with a checkout path on the runner (Run test → Repository).';
    }
    if (!app.repositoryPath && !app.filesystemModuleRoot) {
      return 'Set `repositoryPath` on the app in Settings/registry, or pass `repoRoot` for this run.';
    }
    return 'Add the **code-quality** pack on a repository run.';
  }
  if (cat.id === 'security' && inputMode === 'url') {
    return 'URL-only runs use passive scope only; full secret/dependency scans need **repository** mode + **security** pack.';
  }
  if (cat.id === 'module-inventory') {
    if (!(app.modules ?? []).length || app.id === 'adhoc-url-scan') {
      return 'Not applicable — ad-hoc URL scans do not use registered module inventory (L2).';
    }
    if (!app.filesystemModuleRoot) {
      return 'This app has module routes in the registry but no `filesystemModuleRoot` — L2 records inventory only until a repo path is configured.';
    }
  }
  if (cat.id === 'workflows') {
    return 'Workflow recipes need configured accounts and templates (`registry/workflows/templates.json`).';
  }
  if (cat.id === 'load-recovery') {
    return 'Load tests are opt-in on non-production environments.';
  }
  if (cat.id === 'ui-a11y') {
    return 'Add **ui-a11y** pack or include **level 4** in the run.';
  }
  if (cat.id === 'live-url-health') {
    return 'Not included in this run configuration.';
  }
  return `Not included — use input mode **${(cat.requires.inputModes ?? []).join(' or ')}** and relevant levels/packs.`;
}

/**
 * @param {object} app
 * @param {object} runRequest
 * @param {object} [toolInventory]
 */
export function buildRunCoverage(app, runRequest, toolInventory = []) {
  const inputMode = runRequest.inputMode ?? 'url';
  const levels = levelsRun(runRequest);
  const packs = resolvePacksExecuted(runRequest);
  const modules = app.modules ?? [];

  const categories = BUILD_CATEGORIES.map((cat) => {
    const ran = categoryRan(cat, inputMode, levels, packs);
    return {
      id: cat.id,
      label: cat.label,
      status: ran ? 'executed' : 'not_run',
      reason: ran ? null : skipReason(cat, inputMode, app),
    };
  });

  const modulesStatus = modules.map((m) => {
    const routeChecks = levels.includes(1) && inputMode === 'url';
    return {
      moduleId: m.id,
      label: m.label,
      routes: m.routes ?? [],
      registryStatus: m.status,
      exercisedInRun: false,
      note: routeChecks
        ? 'Level 1 does not crawl module routes — only the entry URL. Use Level 2+ or workflow packs for route coverage.'
        : 'Module routes not in scope for this input mode/levels.',
    };
  });

  const executedTools = (toolInventory ?? []).filter((t) => t.executed).map((t) => t.tool);
  const skippedTools = (toolInventory ?? []).filter((t) => !t.executed);

  const isBuildAdequate =
    categories.find((c) => c.id === 'live-url-health')?.status === 'executed' &&
    (inputMode === 'repository'
      ? categories.find((c) => c.id === 'code-quality')?.status === 'executed'
      : true);

  const recommendedPacks = [];
  if (inputMode === 'url' || inputMode === 'html') {
    if (!packs.includes('quick-health') && !levels.includes(1)) recommendedPacks.push('quick-health');
    if (!packs.includes('ui-a11y') && !levels.includes(4)) recommendedPacks.push('ui-a11y');
  }
  if (app.repositoryPath || inputMode === 'repository') {
    if (!packs.includes('code-quality')) recommendedPacks.push('code-quality');
    if (!packs.includes('security')) recommendedPacks.push('security');
  }
  if ((app.criticalWorkflows ?? []).length && !packs.includes('workflow')) {
    recommendedPacks.push('workflow');
  }

  let profileLabel = 'Custom';
  if (packs.length === 1 && packs[0] === 'quick-health') profileLabel = 'Quick URL health only';
  else if (levels.length === 1 && levels[0] === 1 && !packs.length) profileLabel = 'Level 1 URL scan only';
  else if (recommendedPacks.length === 0) profileLabel = 'Broad build verification';

  const honestyNote =
    profileLabel.includes('only') || profileLabel.includes('Quick') || (levels.length === 1 && levels[0] === 1 && packs.length <= 1)
      ? 'This run is a narrow smoke check — not a full build or release gate. Repository tests, module routes, and deep quality packs were not required.'
      : packs.length < 2 && inputMode === 'url'
        ? 'Limited URL pack scope — expand packs (ui-a11y, code-quality with repo path) before treating results as release-ready.'
        : null;

  return {
    profileLabel,
    honestyNote,
    isBuildAdequate,
    inputMode,
    levels,
    packs,
    categories,
    modules: modulesStatus,
    toolsExecuted: executedTools,
    toolsSkipped: skippedTools.map((t) => ({
      tool: t.tool,
      reason: t.executedReason ?? t.configuredReason ?? 'Not executed',
    })),
    recommended: {
      packs: [...new Set(recommendedPacks)],
      runTestQuery: buildRunTestQuery(app.id, recommendedPacks, inputMode === 'repository' ? 'repository' : 'url'),
      checklist: buildChecklist(categories),
    },
  };
}

function buildRunTestQuery(appId, packs, inputMode) {
  const params = new URLSearchParams({ app: appId, inputMode });
  if (packs.length) params.set('packs', packs.join(','));
  return `/run?${params.toString()}`;
}

function buildChecklist(categories) {
  return categories.map((c) => ({
    label: c.label,
    done: c.status === 'executed',
    action: c.status === 'executed' ? null : c.reason,
  }));
}

