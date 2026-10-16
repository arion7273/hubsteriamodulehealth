/** Allowed verification commands (prefix match). No shell interpolation from AI. */
export const ALLOWED_VERIFY_COMMANDS = [
  { id: 'verify:workflows', argv: ['npm', 'run', 'verify:workflows'], cwd: 'repo' },
  {
    id: 'verify:workflows-regression',
    argv: ['npm', 'run', 'verify:workflows-regression'],
    cwd: 'repo',
  },
  { id: 'verify:comparison', argv: ['npm', 'run', 'verify:comparison'], cwd: 'repo' },
  { id: 'verify:reports', argv: ['npm', 'run', 'verify:reports'], cwd: 'repo' },
];

export function resolveVerifyCommand(commandId) {
  return ALLOWED_VERIFY_COMMANDS.find((c) => c.id === commandId) ?? null;
}

export function assertRepoPathSafe(repoRoot, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\//, '');
  if (normalized.includes('..') || normalized.startsWith('data/secrets')) {
    throw new Error('Path not allowed for repair');
  }
  return normalized;
}
