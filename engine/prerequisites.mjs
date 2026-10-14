/** Mark findings blocked when prerequisite checkIds failed or readiness not met. */
export function applyPrerequisites(findings, prerequisiteCheckId, dependentPrefix) {
  const prereq = findings.find((f) => f.checkId === prerequisiteCheckId);
  const prereqOk = prereq?.status === 'pass';
  if (prereqOk) return findings;

  return findings.map((f) => {
    if (!f.checkId.startsWith(dependentPrefix)) return f;
    if (f.checkId === prerequisiteCheckId) return f;
    if (f.status === 'pass' || f.status === 'info') {
      return {
        ...f,
        status: 'blocked',
        severity: 'info',
        detail: `Blocked: prerequisite ${prerequisiteCheckId} not satisfied (${prereq?.status ?? 'missing'})`,
        blockedBy: prerequisiteCheckId,
      };
    }
    return f;
  });
}
