export function prerequisiteLabel(f) {
  if (f.blockedBy) return `Prerequisite not met: ${f.blockedBy}`;
  if (f.detail && /Blocked:/i.test(f.detail)) return f.detail;
  if (f.status === 'not_tested') return f.detail ?? f.actual ?? 'Check was not executed in this run.';
  if (f.status === 'blocked') return f.actual ?? f.detail ?? 'Blocked by run configuration or prerequisites.';
  return f.remediation?.summary ?? f.detail ?? null;
}
