import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fail, pass, skip, blocked } from '../scripts/lib/finding.mjs';
import { exists, listSourceFiles, readText, walkFiles } from '../scripts/lib/fs-util.mjs';

const DOC_BASE = 'docs/MODULE_HEALTH_PROTOCOL.md';

/** @type {import('../scripts/lib/types.mjs').CheckDef[]} */
export const CHECKS = [
  // —— Discovery ——
  {
    checkId: 'discovery.module.root-exists',
    category: 'manifest',
    layer: 'discovery',
    title: 'Module root directory exists',
    run(ctx) {
      if (!exists(ctx.moduleRootAbs)) {
        return fail({
          checkId: 'discovery.module.root-exists',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'discovery',
          severity: 'blocker',
          title: 'Module root missing',
          detail: `Path not found: ${ctx.moduleRootAbs}`,
          remediation: {
            summary: 'Point modules.manifest.json root at a valid directory or create the module folder.',
            steps: ['Verify root path in modules.manifest.json'],
          },
          fix: { capability: 'manual' },
        });
      }
      return pass({
        checkId: 'discovery.module.root-exists',
        moduleId: ctx.module.moduleId,
        category: 'manifest',
        layer: 'discovery',
        title: 'Module root exists',
        detail: ctx.moduleRootAbs,
      });
    },
  },
  {
    checkId: 'discovery.module.package-json',
    category: 'manifest',
    layer: 'discovery',
    title: 'package.json present',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'package.json');
      if (!exists(p)) {
        return fail({
          checkId: 'discovery.module.package-json',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'discovery',
          severity: 'blocker',
          title: 'Missing package.json',
          remediation: {
            summary: 'Add package.json for the module.',
            docUrl: DOC_BASE,
          },
          fix: { capability: 'auto', fixId: 'scaffold-package-json', confidence: 'high', risk: 'low', preview: 'Create minimal package.json' },
        });
      }
      return pass({
        checkId: 'discovery.module.package-json',
        moduleId: ctx.module.moduleId,
        category: 'manifest',
        layer: 'discovery',
        title: 'package.json present',
      });
    },
  },
  {
    checkId: 'manifest.package.verify-script',
    category: 'manifest',
    layer: 'static',
    title: 'npm script "verify" defined',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'package.json');
      if (!exists(p)) return skip({ checkId: 'manifest.package.verify-script', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'verify script' }, 'no package.json');
      const pkg = JSON.parse(readText(p));
      if (pkg.scripts?.verify) {
        return pass({
          checkId: 'manifest.package.verify-script',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'static',
          title: 'verify script present',
          detail: pkg.scripts.verify,
        });
      }
      return fail({
        checkId: 'manifest.package.verify-script',
        moduleId: ctx.module.moduleId,
        category: 'manifest',
        layer: 'static',
        severity: 'high',
        title: 'Missing scripts.verify',
        remediation: {
          summary: 'Add a verify script that runs module-local health checks.',
          steps: ['Add "verify": "node scripts/verify-module.mjs" to package.json'],
          docUrl: DOC_BASE,
        },
        fix: { capability: 'auto', fixId: 'add-verify-script', confidence: 'high', risk: 'low', preview: 'Add verify script + stub file' },
      });
    },
  },
  {
    checkId: 'manifest.package.smoke-script',
    category: 'manifest',
    layer: 'static',
    title: 'npm script "test:smoke" defined',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'package.json');
      if (!exists(p)) return skip({ checkId: 'manifest.package.smoke-script', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'smoke script' }, 'no package.json');
      const pkg = JSON.parse(readText(p));
      if (pkg.scripts?.['test:smoke']) {
        return pass({
          checkId: 'manifest.package.smoke-script',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'static',
          title: 'test:smoke present',
        });
      }
      return fail({
        checkId: 'manifest.package.smoke-script',
        moduleId: ctx.module.moduleId,
        category: 'manifest',
        layer: 'static',
        severity: 'medium',
        title: 'Missing scripts.test:smoke',
        remediation: { summary: 'Add test:smoke for runtime smoke atoms.' },
        fix: { capability: 'auto', fixId: 'add-smoke-script', confidence: 'high', risk: 'low', preview: 'Wire test:smoke to scripts/smoke.mjs' },
      });
    },
  },
  {
    checkId: 'manifest.files.readme',
    category: 'manifest',
    layer: 'static',
    title: 'Module README exists',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'README.md');
      if (!exists(p)) {
        return fail({
          checkId: 'manifest.files.readme',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'static',
          severity: 'low',
          title: 'Missing README.md',
          remediation: { summary: 'Add README.md describing the module scope and verify commands.' },
          fix: { capability: 'auto', fixId: 'scaffold-readme', confidence: 'high', risk: 'low', preview: 'Create README from template' },
        });
      }
      return pass({
        checkId: 'manifest.files.readme',
        moduleId: ctx.module.moduleId,
        category: 'manifest',
        layer: 'static',
        title: 'README present',
      });
    },
  },
  {
    checkId: 'manifest.files.settings-route',
    category: 'portal',
    layer: 'static',
    title: 'Settings surface file exists',
    run(ctx) {
      const candidates = [
        'src/settings.tsx',
        'src/settings/index.tsx',
        'settings/page.tsx',
      ];
      const found = candidates.find((c) => exists(path.join(ctx.moduleRootAbs, c)));
      if (!found) {
        return fail({
          checkId: 'manifest.files.settings-route',
          moduleId: ctx.module.moduleId,
          category: 'portal',
          layer: 'static',
          severity: 'medium',
          title: 'No settings route file',
          detail: `Expected one of: ${candidates.join(', ')}`,
          remediation: { summary: 'Add a settings UI entry for staff configuration.' },
          fix: { capability: 'assisted', fixId: 'scaffold-settings-route', confidence: 'medium', risk: 'medium', preview: 'Create stub settings page' },
        });
      }
      return pass({
        checkId: 'manifest.files.settings-route',
        moduleId: ctx.module.moduleId,
        category: 'portal',
        layer: 'static',
        title: 'Settings route present',
        detail: found,
      });
    },
  },
  {
    checkId: 'env.example.file-exists',
    category: 'security',
    layer: 'static',
    title: '.env.example exists',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, '.env.example');
      if (!exists(p)) {
        return fail({
          checkId: 'env.example.file-exists',
          moduleId: ctx.module.moduleId,
          category: 'security',
          layer: 'static',
          severity: 'high',
          title: 'Missing .env.example',
          remediation: { summary: 'Add .env.example with documented placeholders (no secrets).' },
          fix: { capability: 'auto', fixId: 'create-env-example', confidence: 'high', risk: 'low', preview: 'Create .env.example from env scan' },
        });
      }
      return pass({
        checkId: 'env.example.file-exists',
        moduleId: ctx.module.moduleId,
        category: 'security',
        layer: 'static',
        title: '.env.example present',
      });
    },
  },
  {
    checkId: 'env.example.complete',
    category: 'security',
    layer: 'static',
    title: 'Env vars in code documented in .env.example',
    run(ctx) {
      const srcDir = path.join(ctx.moduleRootAbs, 'src');
      if (!exists(srcDir)) {
        return skip({ checkId: 'env.example.complete', moduleId: ctx.module.moduleId, category: 'security', layer: 'static', title: 'env complete' }, 'no src/');
      }
      const used = new Set();
      const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
      for (const file of listSourceFiles(srcDir)) {
        const text = readText(file);
        let m;
        while ((m = re.exec(text))) used.add(m[1]);
      }
      const examplePath = path.join(ctx.moduleRootAbs, '.env.example');
      const documented = new Set();
      if (exists(examplePath)) {
        for (const line of readText(examplePath).split('\n')) {
          const t = line.trim();
          if (!t || t.startsWith('#')) continue;
          const key = t.split('=')[0]?.trim();
          if (key) documented.add(key);
        }
      }
      const missing = [...used].filter((k) => !documented.has(k));
      if (missing.length) {
        return fail({
          checkId: 'env.example.complete',
          moduleId: ctx.module.moduleId,
          category: 'security',
          layer: 'static',
          severity: 'high',
          title: 'Undocumented environment variables',
          detail: `Missing from .env.example: ${missing.join(', ')}`,
          remediation: {
            summary: 'Add each key to .env.example with empty value and comment.',
            steps: missing.map((k) => `Add ${k}= to .env.example`),
          },
          fix: { capability: 'auto', fixId: 'env-sync-example', confidence: 'high', risk: 'low', preview: `Append ${missing.length} key(s) to .env.example` },
        });
      }
      return pass({
        checkId: 'env.example.complete',
        moduleId: ctx.module.moduleId,
        category: 'security',
        layer: 'static',
        title: 'All scanned env vars documented',
        detail: used.size ? `${used.size} var(s)` : 'none scanned',
      });
    },
  },
  {
    checkId: 'security.no-service-role-in-client',
    category: 'security',
    layer: 'static',
    title: 'Service role key not referenced in client bundle paths',
    run(ctx) {
      const clientDirs = ['src/components', 'src/settings', 'src/portal'].map((d) =>
        path.join(ctx.moduleRootAbs, d),
      );
      const hits = [];
      for (const dir of clientDirs) {
        if (!exists(dir)) continue;
        for (const file of listSourceFiles(dir)) {
          const text = readText(file);
          if (/SERVICE_ROLE|service_role/i.test(text)) {
            hits.push(path.relative(ctx.moduleRootAbs, file));
          }
        }
      }
      if (hits.length) {
        return fail({
          checkId: 'security.no-service-role-in-client',
          moduleId: ctx.module.moduleId,
          category: 'security',
          layer: 'static',
          severity: 'blocker',
          title: 'Service role referenced in client paths',
          detail: hits.join(', '),
          remediation: { summary: 'Move service-role usage to server-only code.' },
          fix: { capability: 'manual' },
        });
      }
      return pass({
        checkId: 'security.no-service-role-in-client',
        moduleId: ctx.module.moduleId,
        category: 'security',
        layer: 'static',
        title: 'No service role in client paths',
      });
    },
  },
  {
    checkId: 'security.no-console-in-src',
    category: 'observability',
    layer: 'static',
    title: 'No console.log in src (use structured logging)',
    run(ctx) {
      const srcDir = path.join(ctx.moduleRootAbs, 'src');
      if (!exists(srcDir)) return skip({ checkId: 'security.no-console-in-src', moduleId: ctx.module.moduleId, category: 'observability', layer: 'static', title: 'console' }, 'no src');
      const hits = [];
      for (const file of listSourceFiles(srcDir)) {
        const lines = readText(file).split('\n');
        lines.forEach((line, i) => {
          if (/console\.(log|debug)\(/.test(line)) {
            hits.push({ file: path.relative(ctx.moduleRootAbs, file), line: i + 1 });
          }
        });
      }
      if (hits.length) {
        return fail({
          checkId: 'security.no-console-in-src',
          moduleId: ctx.module.moduleId,
          category: 'observability',
          layer: 'static',
          severity: 'low',
          title: 'console.log/debug found',
          detail: hits.map((h) => `${h.file}:${h.line}`).join('; '),
          evidence: hits.map((h) => ({ type: 'file', path: h.file, line: h.line })),
          remediation: { summary: 'Remove or replace with structured logger.' },
          fix: { capability: 'assisted', fixId: 'strip-console-log', confidence: 'low', risk: 'medium', preview: 'Comment out console.log lines' },
        });
      }
      return pass({
        checkId: 'security.no-console-in-src',
        moduleId: ctx.module.moduleId,
        category: 'observability',
        layer: 'static',
        title: 'No console.log in src',
      });
    },
  },
  {
    checkId: 'schema.migrations-dir',
    category: 'schema',
    layer: 'contract',
    title: 'supabase/migrations directory exists',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'supabase/migrations');
      if (!exists(p)) {
        return fail({
          checkId: 'schema.migrations-dir',
          moduleId: ctx.module.moduleId,
          category: 'schema',
          layer: 'contract',
          severity: 'medium',
          title: 'Missing supabase/migrations',
          remediation: { summary: 'Add SQL migrations for module tables.' },
          fix: { capability: 'assisted', fixId: 'scaffold-migrations-dir', confidence: 'medium', risk: 'medium', preview: 'Create migrations folder + placeholder' },
        });
      }
      return pass({
        checkId: 'schema.migrations-dir',
        moduleId: ctx.module.moduleId,
        category: 'schema',
        layer: 'contract',
        title: 'Migrations directory present',
      });
    },
  },
  {
    checkId: 'schema.rls.declared',
    category: 'schema',
    layer: 'contract',
    title: 'RLS enable statements in migrations',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'supabase/migrations');
      if (!exists(p)) {
        return blocked({ checkId: 'schema.rls.declared', moduleId: ctx.module.moduleId, category: 'schema', layer: 'contract', severity: 'high', title: 'RLS check blocked' }, 'no migrations dir');
      }
      let sql = '';
      walkFiles(p, (_, abs) => {
        if (abs.endsWith('.sql')) sql += readText(abs) + '\n';
      });
      const hasRls = /ENABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(sql);
      if (!hasRls) {
        return fail({
          checkId: 'schema.rls.declared',
          moduleId: ctx.module.moduleId,
          category: 'schema',
          layer: 'contract',
          severity: 'high',
          title: 'No RLS ENABLE found in migrations',
          remediation: { summary: 'Add ALTER TABLE ... ENABLE ROW LEVEL SECURITY for PHI tables.' },
          fix: { capability: 'auto', fixId: 'enable-rls-in-migrations', confidence: 'high', risk: 'low', preview: 'Append ENABLE ROW LEVEL SECURITY to latest migration' },
        });
      }
      return pass({
        checkId: 'schema.rls.declared',
        moduleId: ctx.module.moduleId,
        category: 'schema',
        layer: 'contract',
        title: 'RLS declarations found',
      });
    },
  },
  {
    checkId: 'contract.api.routes-file',
    category: 'api',
    layer: 'contract',
    title: 'API routes manifest exists',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'src/api/routes.json');
      if (!exists(p)) {
        return fail({
          checkId: 'contract.api.routes-file',
          moduleId: ctx.module.moduleId,
          category: 'api',
          layer: 'contract',
          severity: 'medium',
          title: 'Missing src/api/routes.json',
          remediation: { summary: 'Declare HTTP routes for contract checks.' },
          fix: { capability: 'auto', fixId: 'scaffold-routes-json', confidence: 'high', risk: 'low', preview: 'Create routes.json with /health' },
        });
      }
      return pass({
        checkId: 'contract.api.routes-file',
        moduleId: ctx.module.moduleId,
        category: 'api',
        layer: 'contract',
        title: 'routes.json present',
      });
    },
  },
  {
    checkId: 'contract.api.health-listed',
    category: 'api',
    layer: 'contract',
    title: '/health listed in routes.json',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'src/api/routes.json');
      if (!exists(p)) return skip({ checkId: 'contract.api.health-listed', moduleId: ctx.module.moduleId, category: 'api', layer: 'contract', title: 'health listed' }, 'no routes.json');
      const routes = JSON.parse(readText(p));
      const ok = Array.isArray(routes) && routes.some((r) => r.path === '/health');
      if (!ok) {
        return fail({
          checkId: 'contract.api.health-listed',
          moduleId: ctx.module.moduleId,
          category: 'api',
          layer: 'contract',
          severity: 'high',
          title: '/health not in routes.json',
          fix: { capability: 'auto', fixId: 'add-health-route-json', confidence: 'high', risk: 'low', preview: 'Add /health entry' },
          remediation: { summary: 'Add { "path": "/health", "method": "GET" } to routes.json' },
        });
      }
      return pass({
        checkId: 'contract.api.health-listed',
        moduleId: ctx.module.moduleId,
        category: 'api',
        layer: 'contract',
        title: '/health declared',
      });
    },
  },
  {
    checkId: 'smoke.health.handler',
    category: 'api',
    layer: 'smoke',
    title: 'Health handler module exists',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'src/api/health.mjs');
      if (!exists(p)) {
        return fail({
          checkId: 'smoke.health.handler',
          moduleId: ctx.module.moduleId,
          category: 'api',
          layer: 'smoke',
          severity: 'high',
          title: 'Missing src/api/health.mjs',
          fix: { capability: 'auto', fixId: 'scaffold-health-handler', confidence: 'high', risk: 'low', preview: 'Create health handler' },
          remediation: { summary: 'Implement health handler returning { ok: true }.' },
        });
      }
      return pass({
        checkId: 'smoke.health.handler',
        moduleId: ctx.module.moduleId,
        category: 'api',
        layer: 'smoke',
        title: 'Health handler present',
      });
    },
  },
  {
    checkId: 'smoke.health.endpoint',
    category: 'api',
    layer: 'smoke',
    title: 'Health handler returns ok',
    async run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'src/api/health.mjs');
      if (!exists(p)) {
        return blocked({ checkId: 'smoke.health.endpoint', moduleId: ctx.module.moduleId, category: 'api', layer: 'smoke', severity: 'high', title: 'Health smoke blocked' }, 'no handler');
      }
      try {
        const mod = await import(`${pathToFileUrl(p)}?run=${Date.now()}`);
        const res = await mod.getHealth();
        if (res?.ok === true) {
          return pass({
            checkId: 'smoke.health.endpoint',
            moduleId: ctx.module.moduleId,
            category: 'api',
            layer: 'smoke',
            title: 'Health returns ok',
          });
        }
        return fail({
          checkId: 'smoke.health.endpoint',
          moduleId: ctx.module.moduleId,
          category: 'api',
          layer: 'smoke',
          severity: 'blocker',
          title: 'Health response invalid',
          detail: JSON.stringify(res),
          remediation: { summary: 'Return { ok: true } from getHealth().' },
          fix: { capability: 'auto', fixId: 'fix-health-response', confidence: 'high', risk: 'low', preview: 'Set ok: true in health.mjs' },
        });
      } catch (e) {
        return fail({
          checkId: 'smoke.health.endpoint',
          moduleId: ctx.module.moduleId,
          category: 'api',
          layer: 'smoke',
          severity: 'blocker',
          title: 'Health handler threw',
          detail: String(e?.message ?? e),
          fix: { capability: 'assisted', fixId: 'scaffold-health-handler', confidence: 'medium', risk: 'low' },
        });
      }
    },
  },
  {
    checkId: 'manifest.package.name',
    category: 'manifest',
    layer: 'static',
    title: 'package.json has name field',
    run(ctx) {
      const p = path.join(ctx.moduleRootAbs, 'package.json');
      if (!exists(p)) return skip({ checkId: 'manifest.package.name', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'name' }, 'no package.json');
      const pkg = JSON.parse(readText(p));
      if (!pkg.name) {
        return fail({
          checkId: 'manifest.package.name',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'static',
          severity: 'medium',
          title: 'package.json missing name',
          fix: { capability: 'auto', fixId: 'set-package-name', confidence: 'high', risk: 'low', preview: `Set name to @hubsteria/${ctx.module.moduleId}` },
          remediation: { summary: 'Set package name for publishing and health identity.' },
        });
      }
      return pass({ checkId: 'manifest.package.name', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'package name set', detail: pkg.name });
    },
  },
  {
    checkId: 'manifest.files.verify-module-script',
    category: 'manifest',
    layer: 'static',
    title: 'scripts/verify-module.mjs exists when verify script references it',
    run(ctx) {
      const pkgPath = path.join(ctx.moduleRootAbs, 'package.json');
      if (!exists(pkgPath)) return skip({ checkId: 'manifest.files.verify-module-script', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'verify file' }, 'no package.json');
      const verify = JSON.parse(readText(pkgPath)).scripts?.verify ?? '';
      if (!verify.includes('verify-module')) {
        return skip({ checkId: 'manifest.files.verify-module-script', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'verify file' }, 'verify script does not reference verify-module');
      }
      const script = path.join(ctx.moduleRootAbs, 'scripts/verify-module.mjs');
      if (!exists(script)) {
        return fail({
          checkId: 'manifest.files.verify-module-script',
          moduleId: ctx.module.moduleId,
          category: 'manifest',
          layer: 'static',
          severity: 'high',
          title: 'verify-module.mjs missing',
          fix: { capability: 'auto', fixId: 'add-verify-script', confidence: 'high', risk: 'low', preview: 'Create scripts/verify-module.mjs' },
          remediation: { summary: 'Add stub verify script or update package.json verify command.' },
        });
      }
      return pass({ checkId: 'manifest.files.verify-module-script', moduleId: ctx.module.moduleId, category: 'manifest', layer: 'static', title: 'verify-module.mjs present' });
    },
  },
  {
    checkId: 'a11y.settings-has-heading',
    category: 'a11y',
    layer: 'static',
    title: 'Settings page includes h1',
    run(ctx) {
      const candidates = ['src/settings.tsx', 'src/settings/index.tsx'].map((c) => path.join(ctx.moduleRootAbs, c));
      const file = candidates.find(exists);
      if (!file) return skip({ checkId: 'a11y.settings-has-heading', moduleId: ctx.module.moduleId, category: 'a11y', layer: 'static', title: 'h1' }, 'no settings file');
      const text = readText(file);
      if (!/<h1[\s>]/.test(text) && !/role=["']heading["']/.test(text)) {
        return fail({
          checkId: 'a11y.settings-has-heading',
          moduleId: ctx.module.moduleId,
          category: 'a11y',
          layer: 'static',
          severity: 'medium',
          title: 'Settings missing primary heading',
          remediation: { summary: 'Add <h1> for module settings page title.' },
          fix: { capability: 'auto', fixId: 'add-settings-h1', confidence: 'high', risk: 'low', preview: 'Insert h1 in settings component' },
        });
      }
      return pass({ checkId: 'a11y.settings-has-heading', moduleId: ctx.module.moduleId, category: 'a11y', layer: 'static', title: 'Settings has heading' });
    },
  },
  {
    checkId: 'phi.demo-flag-documented',
    category: 'phi',
    layer: 'static',
    title: 'DEMO_MODE documented if referenced',
    run(ctx) {
      const srcDir = path.join(ctx.moduleRootAbs, 'src');
      if (!exists(srcDir)) return skip({ checkId: 'phi.demo-flag-documented', moduleId: ctx.module.moduleId, category: 'phi', layer: 'static', title: 'demo' }, 'no src');
      let usesDemo = false;
      for (const file of listSourceFiles(srcDir)) {
        if (/DEMO_MODE/.test(readText(file))) usesDemo = true;
      }
      if (!usesDemo) {
        return pass({ checkId: 'phi.demo-flag-documented', moduleId: ctx.module.moduleId, category: 'phi', layer: 'static', title: 'DEMO_MODE not used', severity: 'info' });
      }
      const ex = path.join(ctx.moduleRootAbs, '.env.example');
      const doc = exists(ex) && /DEMO_MODE/.test(readText(ex));
      if (!doc) {
        return fail({
          checkId: 'phi.demo-flag-documented',
          moduleId: ctx.module.moduleId,
          category: 'phi',
          layer: 'static',
          severity: 'medium',
          title: 'DEMO_MODE used but not in .env.example',
          fix: { capability: 'auto', fixId: 'env-sync-example', confidence: 'high', risk: 'low', preview: 'Add DEMO_MODE to .env.example' },
          remediation: { summary: 'Document DEMO_MODE in .env.example.' },
        });
      }
      return pass({ checkId: 'phi.demo-flag-documented', moduleId: ctx.module.moduleId, category: 'phi', layer: 'static', title: 'DEMO_MODE documented' });
    },
  },
  {
    checkId: 'conformance.claims-mapped',
    category: 'conformance',
    layer: 'conformance',
    title: 'Module claims exist in docs/module-claims.json',
    run(ctx) {
      const claimsPath = path.join(ctx.moduleRootAbs, '../../docs/module-claims.json');
      const repoClaims = path.join(process.cwd(), 'docs/module-claims.json');
      const cp = exists(repoClaims) ? repoClaims : claimsPath;
      if (!exists(cp)) {
        return skip({ checkId: 'conformance.claims-mapped', moduleId: ctx.module.moduleId, category: 'conformance', layer: 'conformance', title: 'claims' }, 'no claims file');
      }
      const data = JSON.parse(readText(cp));
      const forMod = (data.claims ?? []).filter((c) => c.moduleId === ctx.module.moduleId);
      if (!forMod.length) {
        return fail({
          checkId: 'conformance.claims-mapped',
          moduleId: ctx.module.moduleId,
          category: 'conformance',
          layer: 'conformance',
          severity: 'low',
          title: 'No claims for module',
          remediation: { summary: 'Add claim rows linking checkIds to product requirements.' },
          fix: { capability: 'manual' },
        });
      }
      return pass({
        checkId: 'conformance.claims-mapped',
        moduleId: ctx.module.moduleId,
        category: 'conformance',
        layer: 'conformance',
        title: 'Claims mapped',
        detail: `${forMod.length} claim(s)`,
      });
    },
  },
];

function pathToFileUrl(p) {
  return pathToFileURL(p).href;
}
