/**
 * Advertised testing capabilities — update when implementations change.
 * Status: verified | implemented_unverified | partial | stub | blocked_config
 */
export const CAPABILITY_AUDIT = [
  { id: 'l1.quick-health', label: 'L1 URL quick health', status: 'verified', note: 'verify:platform, defect fixture' },
  { id: 'l4.ui-a11y', label: 'L4 axe/Lighthouse', status: 'verified', note: 'verify:adapters' },
  { id: 'l2.module', label: 'L2 filesystem modules', status: 'implemented_unverified', note: 'module:health CLI' },
  {
    id: 'l3.workflows',
    label: 'L3 workflow recipes',
    status: 'partial',
    note: 'Executor + workflow-gap-fixture; Hubsteria app templates still blocked',
  },
  { id: 'pack.code-quality', label: 'Repository ESLint/TS/tests', status: 'verified', note: 'adapter-fixture' },
  { id: 'pack.security', label: 'Security scanners', status: 'partial', note: 'ZAP opt-in' },
  { id: 'pack.workflow', label: 'Workflow pack', status: 'partial', note: 'Runs L3 when workflows configured' },
  { id: 'comparison', label: 'Run-to-run comparison', status: 'verified', note: 'verify:comparison' },
  { id: 'gap.manifest', label: 'Expected-behavior manifest', status: 'implemented_unverified', note: 'registry/expected-behavior' },
];

export function summarizeCapabilities() {
  const counts = {};
  for (const c of CAPABILITY_AUDIT) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  }
  return { capabilities: CAPABILITY_AUDIT, counts };
}
