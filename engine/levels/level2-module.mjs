import path from 'node:path';
import { CHECKS } from '../../checks/registry.mjs';
import { createFinding } from '../findings.mjs';
import { exists } from '../../scripts/lib/fs-util.mjs';

/**
 * Filesystem module checks (legacy suite) scoped to an app with filesystemModuleRoot.
 * Browser module checks are blocked without authenticated live env.
 */
export async function runLevel2ModuleChecks(ctx) {
  const findings = [];
  const { app, environment, inputMode, moduleIds } = ctx;

  if (inputMode === 'html') {
    findings.push(
      createFinding({
        checkId: 'l2.scope.html-blocked',
        appId: app.id,
        environment,
        level: 2,
        status: 'blocked',
        severity: 'info',
        title: 'Module persistence checks blocked for HTML snapshot',
        actual: 'HTML mode cannot verify save/reload or API persistence.',
        remediation: { summary: 'Use live URL with test environment and seeded data.' },
      }),
    );
    return findings;
  }

  const root = app.filesystemModuleRoot;
  if (!root) {
    for (const mod of app.modules ?? []) {
      if (moduleIds?.length && !moduleIds.includes(mod.id)) continue;
      findings.push(
        createFinding({
          checkId: 'l2.module.inventory',
          appId: app.id,
          moduleId: mod.id,
          environment,
          level: 2,
          status: mod.status === 'present' ? 'not_tested' : 'not_applicable',
          severity: 'info',
          title: `Module inventory: ${mod.label}`,
          actual: `Configured status=${mod.status}; no filesystemModuleRoot for automated module checks.`,
        }),
      );
    }
    findings.push(
      createFinding({
        checkId: 'l2.browser.mutations',
        appId: app.id,
        environment,
        level: 2,
        status: 'blocked',
        severity: 'medium',
        title: 'Browser module interactions not configured',
        remediation: { summary: 'Configure test accounts, routes, and mutationsAllowed on staging.' },
      }),
    );
    return findings;
  }

  const moduleRootAbs = path.isAbsolute(root) ? root : path.resolve(root);
  if (!exists(moduleRootAbs)) {
    findings.push(
      createFinding({
        checkId: 'l2.filesystem.root',
        appId: app.id,
        environment,
        level: 2,
        status: 'blocked',
        severity: 'high',
        title: 'filesystemModuleRoot path missing',
        actual: moduleRootAbs,
      }),
    );
    return findings;
  }

  const checkCtx = {
    module: { moduleId: app.id, displayName: app.name, root: moduleRootAbs },
    moduleRootAbs,
    manifest: { modules: [{ moduleId: app.id, root: moduleRootAbs }] },
  };

  for (const check of CHECKS) {
    const result = await check.run(checkCtx);
    findings.push(
      createFinding({
        checkId: `l2.fs.${result.checkId}`,
        appId: app.id,
        moduleId: app.id,
        environment,
        level: 2,
        status: result.status === 'skip' ? 'not_tested' : result.status,
        severity: result.severity ?? 'medium',
        title: result.title,
        detail: result.detail,
        remediation: result.remediation,
        fix: result.fix,
      }),
    );
  }

  return findings;
}
