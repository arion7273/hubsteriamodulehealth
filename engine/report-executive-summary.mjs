const SEVERITY_ORDER = { blocker: 0, high: 1, medium: 2, low: 3, info: 4 };

/**
 * @param {object} report - normalized report with structured.sections
 * @returns {object}
 */
export function buildExecutiveSummary(report) {
  const sections = report.structured?.sections ?? {};
  const buckets = [
    { key: 'app_defects', label: 'Application defect' },
    { key: 'runner_failures', label: 'Runner / tool failure' },
    { key: 'review', label: 'Review' },
  ];

  const items = [];
  for (const { key, label } of buckets) {
    const list = sections[key] ?? [];
    for (const f of list) {
      if (f.status !== 'fail') continue;
      items.push(toSummaryItem(f, label, report.runId));
    }
  }

  const blocked = (sections.blocked ?? []).filter((f) => f.status === 'blocked' || f.status === 'fail');
  for (const f of blocked) {
    items.push({
      ...toSummaryItem(f, 'Blocked / prerequisite', report.runId),
      severity: f.severity ?? 'blocker',
      priority: 0,
    });
  }

  items.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.title.localeCompare(b.title),
  );

  const failIds = new Set(items.map((i) => i.findingId));
  const orphanFails = (report.findings ?? []).filter((f) => f.status === 'fail' && !failIds.has(f.id));
  for (const f of orphanFails) {
    items.push(toSummaryItem(f, 'Uncategorized fail', report.runId));
  }

  return {
    gate: report.gate,
    headline: report.headline,
    itemCount: items.length,
    items,
    coverageNote: report.coverage?.honestyNote ?? null,
    scope: {
      inputMode: report.inputMode,
      levels: report.levels,
      packsExecuted: report.packsExecuted ?? [],
    },
  };
}

function toSummaryItem(f, sectionLabel, runId) {
  const evidenceRefs = (f.evidence ?? [])
    .map((e) => e.path ?? e.ref ?? e.value?.slice?.(0, 80) ?? e.type)
    .filter(Boolean)
    .slice(0, 5);

  return {
    findingId: f.id,
    checkId: f.checkId,
    title: f.title,
    severity: f.severity ?? 'medium',
    sectionLabel,
    userImpact: f.userImpact ?? null,
    remediationSummary: f.remediation?.summary ?? f.detail ?? null,
    expected: f.expected ?? null,
    actual: f.actual ?? null,
    evidenceRefs,
    retestCheckId: f.checkId,
    reportPath: runId ? `/reports/${runId}` : null,
  };
}
