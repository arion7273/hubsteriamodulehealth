import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * @typedef {object} Manifest
 * @property {number} version
 * @property {object} [defaults]
 * @property {import('./types.mjs').ModuleConfig[]} modules
 */

/**
 * @param {string} manifestPath
 * @returns {Manifest}
 */
export function loadManifest(manifestPath) {
  const abs = path.isAbsolute(manifestPath)
    ? manifestPath
    : path.join(REPO_ROOT, manifestPath);
  const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
  return raw;
}

/**
 * @param {import('./types.mjs').ModuleConfig} mod
 */
export function resolveModuleRoot(mod) {
  return path.isAbsolute(mod.root) ? mod.root : path.join(REPO_ROOT, mod.root);
}
