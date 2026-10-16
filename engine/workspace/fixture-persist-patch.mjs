import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_REL = 'fixtures/workflow-app/create.html';

/**
 * Deterministic fix: broken-persist shows Saved but must persist like fixed branch.
 */
export function buildPersistFixPatch(repoRoot) {
  const full = path.join(path.resolve(repoRoot), FIXTURE_REL);
  if (!fs.existsSync(full)) {
    return { rationale: 'Fixture file missing', files: [] };
  }
  const before = fs.readFileSync(full, 'utf8');
  const after = before.replace(
    `      if (variant === 'broken-persist') {
        status.textContent = 'Saved';
        status.className = 'ok';
        return;
      }`,
    `      if (variant === 'broken-persist') {
        localStorage.setItem(KEY, name);
        localStorage.setItem(NOTE_KEY, note);
        status.textContent = 'Saved';
        status.className = 'ok';
        return;
      }`,
  );
  if (after === before) {
    return {
      rationale: 'broken-persist block already fixed or pattern changed',
      files: [],
      alreadyFixed: true,
    };
  }
  return {
    rationale:
      'Persist record name/note to localStorage when variant is broken-persist (fake success without persistence defect).',
    files: [{ path: FIXTURE_REL, content: after }],
    generatedBy: 'deterministic-fixture-patch',
  };
}
