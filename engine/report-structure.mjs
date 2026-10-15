import { classifyFindingOutcome } from './finding-classify.mjs';
import { ensureFindingRemediation } from './finding-remediation.mjs';

const SECTION_ORDER = [
  'app_defects',
  'runner_failures',
  'review',
  'blocked',
  'not_executed',
  'not_applicable',
  'passing',
];

export function structureReport(findings) {
  const enriched = findings.map(ensureFindingRemediation);
  const sections = {
    app_defects: [],
    runner_failures: [],
    review: [],
    blocked: [],
    not_executed: [],
    not_applicable: [],
    passing: [],
    /** @deprecated use app_defects — alias for older UI */
    defects: [],
    warnings: [],
    not_tested: [],
  };

  for (const f of enriched) {
    const kind = classifyFindingOutcome(f);
    if (f.status === 'pass') {
      sections.passing.push(f);
      continue;
    }
    if (f.status === 'not_applicable') {
      sections.not_applicable.push(f);
      continue;
    }
    if (f.status === 'blocked') {
      sections.blocked.push(f);
      continue;
    }
    if (f.status === 'not_tested' || f.status === 'skip' || f.status === 'not_started') {
      sections.not_executed.push(f);
      sections.not_tested.push(f);
      continue;
    }
    if (f.status === 'fail') {
      if (kind === 'runner_failure') sections.runner_failures.push(f);
      else if (kind === 'app_defect') {
        sections.app_defects.push(f);
        sections.defects.push(f);
      } else {
        sections.review.push(f);
        sections.warnings.push(f);
      }
      continue;
    }
    sections.review.push(f);
    sections.warnings.push(f);
  }

  const sortSeverity = (a, b) =>
    ({ blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[a.severity] ?? 5) -
    ({ blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[b.severity] ?? 5);

  sections.app_defects.sort(sortSeverity);
  sections.defects.sort(sortSeverity);
  sections.runner_failures.sort(sortSeverity);
  sections.review.sort(sortSeverity);
  sections.warnings.sort(sortSeverity);

  return {
    sections,
    sectionOrder: SECTION_ORDER,
    sectionCounts: {
      app_defects: sections.app_defects.length,
      runner_failures: sections.runner_failures.length,
      review: sections.review.length,
      blocked: sections.blocked.length,
      not_executed: sections.not_executed.length,
      not_applicable: sections.not_applicable.length,
      passing: sections.passing.length,
      defects: sections.defects.length,
      warnings: sections.warnings.length,
      not_tested: sections.not_tested.length,
    },
    topFixes: sections.app_defects.slice(0, 10).map((f) => ({
      findingId: f.id,
      checkId: f.checkId,
      title: f.title,
      userImpact: f.userImpact,
      severity: f.severity,
      summary: f.remediation?.summary ?? f.detail,
      acceptanceCriteria: f.acceptanceCriteria ?? 'Re-run the same check and confirm pass.',
    })),
  };
}
