import { structureReport } from './report-structure.mjs';
import { deriveExecution, formatHeadline } from './report-execution.mjs';
import { buildToolInventory } from './tool-inventory.mjs';
import { buildRunCoverage, resolvePacksExecuted } from './run-coverage.mjs';
import { buildExecutiveSummary } from './report-executive-summary.mjs';
import { ensureFindingRemediation } from './finding-remediation.mjs';
import { attachQaAuditRender } from './qa-audit-document.mjs';

const UNAVAILABLE = 'Not recorded for this report';

/**
 * Normalize a stored or in-memory report for API/UI. Does not fabricate missing historical fields.
 * @param {object} raw
 * @returns {object}
 */
export function normalizeRunReport(raw) {
  if (!raw) return null;

  const findings = Array.isArray(raw.findings)
    ? raw.findings.map(ensureFindingRemediation)
    : [];
  const structured = structureReport(findings);

  const execution = deriveExecution(findings);
  const modulesConfigured = raw.summary?.modulesConfigured ?? raw.modulesInventory?.length ?? 0;
  const modulesCovered = raw.summary?.modulesCovered ?? 0;

  const meta = { ...(raw.meta ?? {}) };
  const metaAvailability = {
    targetUrl: meta.targetUrl != null && meta.targetUrl !== '',
    finalUrl: meta.finalUrl != null && meta.finalUrl !== '',
    durationMs: meta.durationMs != null,
    startedAt: meta.startedAt != null,
    endedAt: meta.endedAt != null,
  };

  const headline =
    raw.headline && raw.reportSchemaVersion >= 3
      ? raw.headline
      : formatHeadline(execution, modulesConfigured, modulesCovered, {
          runBlocked: raw.gate === 'investigate_blocked' && execution.completed === 0,
        });

  const moduleCoverageNote =
    modulesConfigured === 0
      ? 'Module coverage not configured for this app.'
      : `${modulesCovered} of ${modulesConfigured} module(s) referenced in findings.`;

  const sectionCounts = structured.sectionCounts ?? countSections(structured.sections);

  const consistency = validateConsistency(execution.counts, sectionCounts, structured.sections);

  const draft = {
    ...raw,
    reportSchemaVersion: raw.reportSchemaVersion ?? 3,
    headline,
    findings,
    structured,
    summary: {
      ...(raw.summary ?? {}),
      counts: execution.counts,
      execution: {
        planned: execution.planned,
        completed: execution.completed,
        blocked: execution.blocked,
        notExecuted: execution.notExecuted,
        notApplicable: execution.notApplicable,
      },
      modulesConfigured,
      modulesCovered,
      moduleCoverageNote,
    },
    meta: {
      ...meta,
      targetUrl: metaAvailability.targetUrl ? meta.targetUrl : null,
      finalUrl: metaAvailability.finalUrl ? meta.finalUrl : null,
      durationMs: metaAvailability.durationMs ? meta.durationMs : null,
      startedAt: metaAvailability.startedAt ? meta.startedAt : null,
      endedAt: metaAvailability.endedAt ? meta.endedAt : null,
      unavailable: {
        targetUrl: metaAvailability.targetUrl ? null : UNAVAILABLE,
        finalUrl: metaAvailability.finalUrl ? null : UNAVAILABLE,
        durationMs: metaAvailability.durationMs ? null : UNAVAILABLE,
        startedAt: metaAvailability.startedAt ? null : UNAVAILABLE,
        endedAt: metaAvailability.endedAt ? null : UNAVAILABLE,
      },
      runScope: meta.runScope ?? {
        levels: raw.levels ?? [1],
        inputMode: raw.inputMode ?? 'url',
        packsExecuted: resolvePacksExecuted({
          levels: raw.levels,
          packs: raw.packs,
          packsExecuted: raw.packsExecuted,
        }),
        environment: raw.environment,
      },
      buildIdentification: meta.buildIdentification ?? null,
    },
    toolInventory: raw.toolInventory ?? null,
    coverage: buildRunCoverage(
      {
        id: raw.appId,
        modules: raw.modulesInventory ?? [],
        repositoryPath: meta.repoRoot ?? null,
        filesystemModuleRoot: null,
        criticalWorkflows: [],
      },
      {
        inputMode: raw.inputMode ?? 'url',
        levels: raw.levels ?? [1],
        packs: resolvePacksExecuted({
          levels: raw.levels,
          packs: raw.packs,
          packsExecuted: raw.packsExecuted,
        }),
      },
      raw.toolInventory ?? [],
    ),
    consistency,
    comparisonNote:
      raw.comparisonNote ??
      'Completed means pass or fail. Blocked and not-executed checks are not passes. Compare equivalent environment and level sets.',
  };

  const withExec = {
    ...draft,
    executiveSummary: buildExecutiveSummary(draft),
  };
  return {
    ...withExec,
    qaAudit: attachQaAuditRender(withExec),
  };
}

function countSections(sections) {
  return {
    app_defects: sections?.app_defects?.length ?? sections?.defects?.length ?? 0,
    runner_failures: sections?.runner_failures?.length ?? 0,
    review: sections?.review?.length ?? sections?.warnings?.length ?? 0,
    blocked: sections?.blocked?.length ?? 0,
    not_executed: sections?.not_executed?.length ?? sections?.not_tested?.length ?? 0,
    not_applicable: sections?.not_applicable?.length ?? 0,
    passing: sections?.passing?.length ?? 0,
  };
}

function validateConsistency(counts, sectionCounts, sections) {
  const issues = [];
  const failInSections =
    (sections?.app_defects?.length ?? 0) +
    (sections?.runner_failures?.filter((f) => f.status === 'fail').length ?? 0) +
    (sections?.review?.length ?? 0);
  if (counts.fail !== failInSections) {
    issues.push(`fail count ${counts.fail} vs section fails ${failInSections}`);
  }
  if (counts.pass !== (sectionCounts.passing ?? 0)) {
    issues.push(`pass count ${counts.pass} vs passing section ${sectionCounts.passing}`);
  }
  if (counts.blocked !== (sectionCounts.blocked ?? 0)) {
    issues.push(`blocked count ${counts.blocked} vs blocked section ${sectionCounts.blocked}`);
  }
  const notExec =
    counts.not_tested + counts.not_started + counts.skip;
  if (notExec !== (sectionCounts.not_executed ?? 0)) {
    issues.push(`not-executed count ${notExec} vs section ${sectionCounts.not_executed}`);
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Attach async tool inventory (call before save when ctx available).
 */
export async function attachToolInventory(report, ctx) {
  const toolInventory = await buildToolInventory(report, { preflight: Boolean(ctx), ctx });
  return { ...report, toolInventory };
}
