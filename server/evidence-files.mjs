import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA_DIR } from './storage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const ALLOWED_ROOTS = [
  path.join(ROOT, 'data', 'evidence'),
  path.join(ROOT, 'data', 'artifacts'),
  path.join(ROOT, 'fixtures'),
].map((p) => path.resolve(p));

/**
 * Resolve a file path from evidence ref (relative or absolute under allowed roots).
 */
export function resolveEvidenceFile(ref) {
  if (!ref) return null;
  const abs = path.isAbsolute(ref) ? path.resolve(ref) : path.resolve(ROOT, ref);
  const ok = ALLOWED_ROOTS.some((root) => abs === root || abs.startsWith(root + path.sep));
  if (!ok || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return null;
  return abs;
}
