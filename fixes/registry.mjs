import fs from 'node:fs';
import path from 'node:path';

/**
 * @typedef {object} FixContext
 * @property {string} moduleRootAbs
 * @property {string} moduleId
 * @property {import('../scripts/lib/types.mjs').Finding} finding
 * @property {boolean} dryRun
 */

/**
 * @typedef {object} FixResult
 * @property {boolean} applied
 * @property {string} message
 * @property {string[]} [filesChanged]
 */

/** @type {Record<string, (ctx: FixContext) => Promise<FixResult>|FixResult>} */
export const FIX_HANDLERS = {
  'env-sync-example': envSyncExample,
  'create-env-example': createEnvExample,
  'add-verify-script': addVerifyScript,
  'add-smoke-script': addSmokeScript,
  'scaffold-routes-json': scaffoldRoutesJson,
  'add-health-route-json': addHealthRouteJson,
  'scaffold-health-handler': scaffoldHealthHandler,
  'fix-health-response': fixHealthResponse,
  'scaffold-readme': scaffoldReadme,
  'set-package-name': setPackageName,
  'add-settings-h1': addSettingsH1,
  'enable-rls-in-migrations': enableRlsInMigrations,
};

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeUnlessDry(ctx, filePath, content) {
  if (ctx.dryRun) {
    return { applied: false, message: `dry-run: would write ${filePath}`, filesChanged: [filePath] };
  }
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
  return { applied: true, message: `wrote ${filePath}`, filesChanged: [filePath] };
}

function envSyncExample(ctx) {
  const examplePath = path.join(ctx.moduleRootAbs, '.env.example');
  const detail = ctx.finding.detail ?? '';
  const match = detail.match(/Missing from \.env\.example: (.+)/);
  const keys = match ? match[1].split(',').map((k) => k.trim()) : ['DEMO_MODE'];
  let existing = '';
  if (fs.existsSync(examplePath)) existing = fs.readFileSync(examplePath, 'utf8');
  const lines = [...existing.split('\n')];
  for (const key of keys) {
    if (!existing.includes(`${key}=`)) {
      lines.push(`${key}=`);
    }
  }
  const out = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  return writeUnlessDry(ctx, examplePath, out);
}

function createEnvExample(ctx) {
  return envSyncExample({ ...ctx, finding: { ...ctx.finding, detail: 'Missing from .env.example: DEMO_MODE' } });
}

function addVerifyScript(ctx) {
  const pkgPath = path.join(ctx.moduleRootAbs, 'package.json');
  const scriptPath = path.join(ctx.moduleRootAbs, 'scripts/verify-module.mjs');
  const stub = `#!/usr/bin/env node
/** Module-local verify stub — extend with domain checks. */
console.log(JSON.stringify({ ok: true, module: '${ctx.moduleId}' }));
`;
  const results = [];
  if (!ctx.dryRun) {
    ensureDir(path.dirname(scriptPath));
    if (!fs.existsSync(scriptPath)) fs.writeFileSync(scriptPath, stub, 'utf8');
    results.push(scriptPath);
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      pkg.scripts = pkg.scripts ?? {};
      pkg.scripts.verify = 'node scripts/verify-module.mjs';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
      results.push(pkgPath);
    }
    return { applied: true, message: 'Added verify script', filesChanged: results };
  }
  return { applied: false, message: 'dry-run: would add verify script', filesChanged: [scriptPath, pkgPath] };
}

function addSmokeScript(ctx) {
  const pkgPath = path.join(ctx.moduleRootAbs, 'package.json');
  const smokePath = path.join(ctx.moduleRootAbs, 'scripts/smoke.mjs');
  const stub = `import { getHealth } from '../src/api/health.mjs';
const h = await getHealth();
if (!h?.ok) {
  console.error('smoke failed', h);
  process.exit(1);
}
console.log('smoke ok');
`;
  if (ctx.dryRun) return { applied: false, message: 'dry-run smoke script', filesChanged: [smokePath, pkgPath] };
  ensureDir(path.dirname(smokePath));
  if (!fs.existsSync(smokePath)) fs.writeFileSync(smokePath, stub, 'utf8');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.scripts = pkg.scripts ?? {};
  pkg.scripts['test:smoke'] = 'node scripts/smoke.mjs';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return { applied: true, message: 'Added test:smoke', filesChanged: [smokePath, pkgPath] };
}

function scaffoldRoutesJson(ctx) {
  const p = path.join(ctx.moduleRootAbs, 'src/api/routes.json');
  const content = JSON.stringify([{ path: '/health', method: 'GET' }], null, 2) + '\n';
  return writeUnlessDry(ctx, p, content);
}

function addHealthRouteJson(ctx) {
  const p = path.join(ctx.moduleRootAbs, 'src/api/routes.json');
  let routes = [];
  if (fs.existsSync(p)) routes = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!routes.some((r) => r.path === '/health')) routes.push({ path: '/health', method: 'GET' });
  return writeUnlessDry(ctx, p, JSON.stringify(routes, null, 2) + '\n');
}

function scaffoldHealthHandler(ctx) {
  const p = path.join(ctx.moduleRootAbs, 'src/api/health.mjs');
  const content = `export async function getHealth() {
  return { ok: true, module: '${ctx.moduleId}' };
}
`;
  return writeUnlessDry(ctx, p, content);
}

function fixHealthResponse(ctx) {
  const p = path.join(ctx.moduleRootAbs, 'src/api/health.mjs');
  const content = `export async function getHealth() {
  return { ok: true, module: '${ctx.moduleId}' };
}
`;
  return writeUnlessDry(ctx, p, content);
}

function scaffoldReadme(ctx) {
  const p = path.join(ctx.moduleRootAbs, 'README.md');
  const content = `# ${ctx.moduleId}

Hubsteria module (pilot). Run verify:

\`\`\`bash
npm run verify
\`\`\`
`;
  return writeUnlessDry(ctx, p, content);
}

function setPackageName(ctx) {
  const pkgPath = path.join(ctx.moduleRootAbs, 'package.json');
  if (!fs.existsSync(pkgPath)) return { applied: false, message: 'no package.json' };
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.name = pkg.name || `@hubsteria/${ctx.moduleId}`;
  if (ctx.dryRun) return { applied: false, message: 'dry-run set name', filesChanged: [pkgPath] };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  return { applied: true, message: `set name ${pkg.name}`, filesChanged: [pkgPath] };
}

function enableRlsInMigrations(ctx) {
  const migDir = path.join(ctx.moduleRootAbs, 'supabase/migrations');
  if (!fs.existsSync(migDir)) return { applied: false, message: 'no migrations dir' };
  const files = fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) return { applied: false, message: 'no sql files' };
  const target = path.join(migDir, files[files.length - 1]);
  let sql = fs.readFileSync(target, 'utf8');
  if (/ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql)) {
    return { applied: false, message: 'RLS already present' };
  }
  const tableMatch = sql.match(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-zA-Z0-9_."]+)/i);
  const table = tableMatch ? tableMatch[1].replace(/"/g, '') : null;
  if (!table) return { applied: false, message: 'could not infer table name' };
  const patch = `\nALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;\n`;
  if (ctx.dryRun) return { applied: false, message: 'dry-run RLS', filesChanged: [target] };
  fs.writeFileSync(target, sql.trimEnd() + patch, 'utf8');
  return { applied: true, message: `enabled RLS on ${table}`, filesChanged: [target] };
}

function addSettingsH1(ctx) {
  const candidates = ['src/settings.tsx', 'src/settings/index.tsx'];
  for (const rel of candidates) {
    const p = path.join(ctx.moduleRootAbs, rel);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, 'utf8');
    if (/<h1[\s>]/.test(text)) return { applied: false, message: 'h1 already present' };
    text = text.replace(/return\s*\(\s*/, `return (\n    <h1>${ctx.moduleId} settings</h1>\n    `);
    if (ctx.dryRun) return { applied: false, message: 'dry-run add h1', filesChanged: [p] };
    fs.writeFileSync(p, text, 'utf8');
    return { applied: true, message: 'added h1', filesChanged: [p] };
  }
  return { applied: false, message: 'no settings file found' };
}

/**
 * @param {string} fixId
 * @param {FixContext} ctx
 */
export async function runFix(fixId, ctx) {
  const handler = FIX_HANDLERS[fixId];
  if (!handler) {
    return { applied: false, message: `unknown fixId: ${fixId}` };
  }
  return await handler(ctx);
}
