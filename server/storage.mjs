import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_DEFINITIONS } from '../engine/packs/definitions.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.join(__dirname, '../data');
export const RUNS_DIR = path.join(DATA_DIR, 'runs');
export const SETTINGS_DIR = path.join(DATA_DIR, 'settings');
export const SECRETS_PATH = path.join(DATA_DIR, 'secrets.json');
export const REGISTRY_USER_PATH = path.join(DATA_DIR, 'registry.apps.json');

function defaultPackSettings() {
  const packs = {};
  for (const [id, def] of Object.entries(PACK_DEFINITIONS)) {
    packs[id] = {
      enabled: true,
      label: def.label,
      timeoutMs: null,
      severityThreshold: 'low',
    };
  }
  packs.security = { ...packs.security, zapEnabled: false, gitleaksEnabled: true };
  packs['load-recovery'] = { ...packs['load-recovery'], k6Enabled: false };
  return packs;
}

export function ensureDataDirs() {
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'schedules'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'worker'), { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'artifacts'), { recursive: true });
}

export function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function loadRegistry() {
  const defaultPath = path.join(__dirname, '../registry/apps.json');
  const base = loadJson(defaultPath, { apps: [], global: {} });
  const user = loadJson(REGISTRY_USER_PATH, { apps: [] });
  const byId = new Map(base.apps.map((a) => [a.id, a]));
  for (const a of user.apps ?? []) byId.set(a.id, { ...byId.get(a.id), ...a });
  return { ...base, apps: [...byId.values()] };
}

export function saveUserApp(app) {
  const user = loadJson(REGISTRY_USER_PATH, { apps: [] });
  const idx = user.apps.findIndex((a) => a.id === app.id);
  if (idx >= 0) user.apps[idx] = app;
  else user.apps.push(app);
  saveJson(REGISTRY_USER_PATH, user);
}

export function listRuns(appId) {
  ensureDataDirs();
  const files = fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith('.json'));
  const runs = files
    .map((f) => loadJson(path.join(RUNS_DIR, f), null))
    .filter(Boolean)
    .sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
  return appId ? runs.filter((r) => r.appId === appId) : runs;
}

export function saveRun(report) {
  ensureDataDirs();
  const file = path.join(RUNS_DIR, `${report.runId}.json`);
  saveJson(file, report);
  return file;
}

export function getRun(runId) {
  return loadJson(path.join(RUNS_DIR, `${runId}.json`), null);
}

export function loadModuleSettings(appId) {
  const defaults = {
    enabledChecks: {},
    severityThreshold: 'low',
    budgets: {},
    routeExclusions: [],
    viewports: ['desktop', 'mobile'],
    timeouts: {},
    schedule: { enabled: false },
    evidenceRetentionDays: 30,
    packs: defaultPackSettings(),
  };
  const saved = loadJson(path.join(SETTINGS_DIR, `${appId}.json`), defaults);
  return {
    ...defaults,
    ...saved,
    packs: { ...defaults.packs, ...(saved.packs ?? {}) },
  };
}

export function saveModuleSettings(appId, settings) {
  saveJson(path.join(SETTINGS_DIR, `${appId}.json`), settings);
}

export function loadSecrets() {
  return loadJson(SECRETS_PATH, { accounts: {} });
}
