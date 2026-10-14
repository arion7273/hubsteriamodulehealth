import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ensureDataDirs,
  loadJson,
  loadRegistry,
  listRuns,
  REGISTRY_USER_PATH,
  RUNS_DIR,
  SETTINGS_DIR,
  saveJson,
  saveRun,
  saveUserApp,
  saveModuleSettings,
} from '../../server/storage.mjs';

const BUNDLE_VERSION = 1;

/**
 * @param {object} opts
 */
export function exportMigrationBundle(opts = {}) {
  ensureDataDirs();
  const registry = loadRegistry();
  const overlay = loadJson(REGISTRY_USER_PATH, { apps: [] });
  const settings = {};
  for (const f of fs.existsSync(SETTINGS_DIR) ? fs.readdirSync(SETTINGS_DIR) : []) {
    if (!f.endsWith('.json')) continue;
    const appId = f.replace(/\.json$/, '');
    settings[appId] = loadJson(path.join(SETTINGS_DIR, f), {});
  }

  const secretsRefs = new Set();
  for (const app of registry.apps ?? []) {
    for (const ref of app.testAccountRefs ?? []) secretsRefs.add(ref);
  }

  let runs = [];
  if (opts.includeRuns) {
    runs = listRuns();
    const max = opts.maxRuns ?? 200;
    runs = runs.slice(0, max);
  }

  const checklist = [
    'Install Playwright Chromium on target API host',
    'Set CORS_ORIGINS to new UI origin(s)',
    'Set VITE_API_BASE on UI build to new API URL',
    'Re-create data/secrets.json account entries (refs in secretsAccountRefs)',
    'Run npm test and one ad-hoc URL scan before DNS cutover',
    'Disable schedules on source before final export',
  ];

  return {
    bundleVersion: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      hostname: os.hostname(),
      note: opts.note ?? '',
    },
    registryOverlay: overlay,
    settings,
    runs,
    secretsAccountRefs: [...secretsRefs],
    checklist,
  };
}

/**
 * @param {object} bundle
 * @param {object} opts
 */
export function importMigrationBundle(bundle, opts = {}) {
  if (bundle.bundleVersion !== BUNDLE_VERSION) {
    throw new Error(`Unsupported bundle version ${bundle.bundleVersion}`);
  }

  const report = {
    appsMerged: 0,
    appsSkipped: 0,
    settingsImported: 0,
    runsImported: 0,
    runsSkipped: 0,
    dryRun: !!opts.dryRun,
  };

  if (opts.dryRun) return report;

  ensureDataDirs();

  for (const app of bundle.registryOverlay?.apps ?? []) {
    if (!app.id) continue;
    const existing = loadJson(REGISTRY_USER_PATH, { apps: [] });
    const has = existing.apps.some((a) => a.id === app.id);
    if (has && !opts.merge) {
      report.appsSkipped++;
      continue;
    }
    saveUserApp(app);
    report.appsMerged++;
  }

  for (const [appId, settings] of Object.entries(bundle.settings ?? {})) {
    saveModuleSettings(appId, settings);
    report.settingsImported++;
  }

  for (const run of bundle.runs ?? []) {
    if (!run?.runId) continue;
    const dest = path.join(RUNS_DIR, `${run.runId}.json`);
    if (fs.existsSync(dest) && !opts.replaceRuns) {
      report.runsSkipped++;
      continue;
    }
    saveRun(run);
    report.runsImported++;
  }

  return report;
}

export function writeBundleFile(bundle, outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), JSON.stringify(bundle, null, 2) + '\n', 'utf8');
}

export function readBundleFile(inPath) {
  return JSON.parse(fs.readFileSync(path.resolve(inPath), 'utf8'));
}
