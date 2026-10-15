/**
 * Honest labels for what evidence modes contributed to a run.
 * @param {object} report
 */
export function buildCapabilityModes(report) {
  const modes = [];
  const input = report.inputMode ?? 'url';
  if (input === 'html') modes.push({ id: 'html', label: 'Uploaded HTML inspection', active: true });
  if (input === 'url' || input === 'html') {
    modes.push({
      id: 'live-url',
      label: 'Live URL / browser testing',
      active: input === 'url',
      note: input === 'html' ? 'Not used — HTML snapshot mode.' : null,
    });
  }
  modes.push({
    id: 'authenticated',
    label: 'Authenticated role testing',
    active: Boolean(report.meta?.role || report.findings?.some((f) => f.role)),
    note: 'Not configured unless role accounts and workflows are set up.',
  });
  modes.push({
    id: 'repository',
    label: 'Repository analysis',
    active: input === 'repository' || Boolean(report.meta?.repoRoot),
  });
  modes.push({
    id: 'api-backend',
    label: 'API / backend verification',
    active: false,
    note: 'Not claimed on URL/HTML-only runs.',
  });
  return modes;
}
