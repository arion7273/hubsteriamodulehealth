const SECTION_ORDER = [
  'defects',
  'warnings',
  'blocked',
  'not_tested',
  'not_applicable',
  'passing',
];

export function structureReport(findings) {
  const sections = {
    defects: [],
    warnings: [],
    blocked: [],
    not_tested: [],
    not_applicable: [],
    passing: [],
  };

  for (const f of findings) {
    if (f.status === 'fail') {
      if (f.severity === 'blocker' || f.severity === 'high') sections.defects.push(f);
      else sections.warnings.push(f);
    } else if (f.status === 'blocked') sections.blocked.push(f);
    else if (f.status === 'not_tested' || f.status === 'skip' || f.status === 'not_started') {
      sections.not_tested.push(f);
    } else if (f.status === 'not_applicable') sections.not_applicable.push(f);
    else if (f.status === 'pass') sections.passing.push(f);
    else sections.warnings.push(f);
  }

  const sortSeverity = (a, b) =>
    ({ blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[a.severity] ?? 5) -
    ({ blocker: 0, high: 1, medium: 2, low: 3, info: 4 }[a.severity] ?? 5);

  sections.defects.sort(sortSeverity);
  sections.warnings.sort(sortSeverity);

  return {
    sections,
    sectionOrder: SECTION_ORDER,
    topFixes: sections.defects.slice(0, 10).map((f) => ({
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
