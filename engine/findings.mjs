import crypto from 'node:crypto';

/**
 * @param {object} p
 */
export function createFinding(p) {
  const id = p.id ?? `fnd_${crypto.randomBytes(8).toString('hex')}`;
  const dedupeKey =
    p.dedupeKey ??
    crypto
      .createHash('sha256')
      .update(
        [p.appId, p.moduleId, p.checkId, p.route, p.environment, p.title, p.expected, p.actual]
          .filter(Boolean)
          .join('|'),
      )
      .digest('hex')
      .slice(0, 24);

  return {
    id,
    dedupeKey,
    status: p.status ?? 'fail',
    severity: p.severity ?? 'medium',
    level: p.level ?? 1,
    appId: p.appId,
    moduleId: p.moduleId ?? null,
    route: p.route ?? null,
    role: p.role ?? null,
    environment: p.environment,
    checkId: p.checkId,
    testId: p.testId ?? p.checkId,
    title: p.title,
    userImpact: p.userImpact ?? null,
    expected: p.expected ?? null,
    actual: p.actual ?? null,
    detail: p.detail ?? null,
    reproduction: p.reproduction ?? [],
    evidence: p.evidence ?? [],
    remediation: p.remediation ?? null,
    fix: p.fix ?? null,
    suspectedCause: p.suspectedCause ?? null,
    verifiedObservation: p.verifiedObservation ?? true,
    firstSeen: p.firstSeen ?? new Date().toISOString(),
    lastSeen: p.lastSeen ?? new Date().toISOString(),
    occurrences: p.occurrences ?? 1,
    unstable: p.unstable ?? false,
    initialFailureRetained: p.initialFailureRetained ?? false,
  };
}

export function summarizeFindings(findings) {
  const counts = { pass: 0, fail: 0, blocked: 0, skip: 0, not_tested: 0, not_applicable: 0, not_started: 0 };
  for (const f of findings) {
    counts[f.status] = (counts[f.status] ?? 0) + 1;
  }
  return counts;
}

export function mergeWithHistory(newFindings, previousFindings = []) {
  const prevByKey = new Map(previousFindings.map((f) => [f.dedupeKey, f]));
  return newFindings.map((f) => {
    const prev = prevByKey.get(f.dedupeKey);
    if (!prev) return { ...f, trend: 'new' };
    if (f.status === 'pass' && prev.status === 'fail') return { ...f, trend: 'resolved', firstSeen: prev.firstSeen };
    if (f.status === 'fail' && prev.status === 'fail') return { ...f, trend: 'recurring', firstSeen: prev.firstSeen, occurrences: (prev.occurrences ?? 1) + 1 };
    if (f.status === 'fail' && prev.status === 'pass') return { ...f, trend: 'regression', firstSeen: prev.firstSeen ?? f.firstSeen };
    return { ...f, trend: 'unchanged', firstSeen: prev.firstSeen ?? f.firstSeen };
  });
}

export function buildCursorFixPrompt(finding) {
  return `## Hubsteria Module Health — fix request

**Finding ID:** ${finding.id}
**App:** ${finding.appId} (${finding.environment})
**Module:** ${finding.moduleId ?? 'n/a'}
**Route:** ${finding.route ?? 'n/a'}
**Check:** ${finding.checkId}
**Severity:** ${finding.severity}

### Observed
${finding.actual ?? finding.detail ?? finding.title}

### Expected
${finding.expected ?? 'See product spec / module protocol.'}

### Reproduction
${(finding.reproduction ?? []).map((s, i) => `${i + 1}. ${s}`).join('\n') || 'Run the same test level and scope from HubsteriaModuleHealth.'}

### Evidence (redacted refs)
${JSON.stringify(finding.evidence ?? [], null, 2)}

### Acceptance criteria
- Expected behavior is restored for the route/module above.
- Re-run the same test level in HubsteriaModuleHealth with no new failure for this check.
- Do not claim backend/auth fixes from HTML-only runs.

### Constraints
- Ground changes in repository evidence; do not invent file paths.
- Keep credentials out of code and reports.
`;
}
