import fs from 'node:fs';
import path from 'node:path';

const FIXTURE_REL = 'fixtures/workflow-app/create.html';

const BROKEN_BLOCK = `      if (variant === 'broken-persist') {
        status.textContent = 'Saved';
        status.className = 'ok';
        return;
      }`;

const FIXED_BLOCK = `      if (variant === 'broken-persist') {
        localStorage.setItem(KEY, name);
        localStorage.setItem(NOTE_KEY, note);
        status.textContent = 'Saved';
        status.className = 'ok';
        return;
      }`;

export function fixturePath(repoRoot = process.cwd()) {
  return path.join(repoRoot, FIXTURE_REL);
}

export function ensureBrokenPersistFixture(repoRoot = process.cwd()) {
  const full = fixturePath(repoRoot);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes(BROKEN_BLOCK)) return { changed: false };
  if (!html.includes(FIXED_BLOCK)) {
    throw new Error('create.html missing known broken-persist block — update workflow-fixture-broken.mjs');
  }
  html = html.replace(FIXED_BLOCK, BROKEN_BLOCK);
  fs.writeFileSync(full, html, 'utf8');
  return { changed: true };
}

export function ensureFixedPersistFixture(repoRoot = process.cwd()) {
  const full = fixturePath(repoRoot);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes(FIXED_BLOCK)) return { changed: false };
  if (!html.includes(BROKEN_BLOCK)) {
    throw new Error('create.html missing broken-persist block');
  }
  html = html.replace(BROKEN_BLOCK, FIXED_BLOCK);
  fs.writeFileSync(full, html, 'utf8');
  return { changed: true };
}
