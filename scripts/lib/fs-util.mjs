import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} dir
 * @param {(rel: string, abs: string) => void} visit
 */
export function walkFiles(dir, visit, base = dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const abs = path.join(dir, name);
    const st = fs.statSync(abs);
    if (st.isDirectory()) walkFiles(abs, visit, base);
    else visit(path.relative(base, abs), abs);
  }
}

/**
 * @param {string} root
 * @param {RegExp} [ext]
 * @returns {string[]}
 */
export function listSourceFiles(root, ext = /\.(mjs|cjs|js|ts|tsx)$/) {
  const files = [];
  walkFiles(root, (rel, abs) => {
    if (ext.test(rel)) files.push(abs);
  });
  return files;
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * @param {string} filePath
 * @returns {boolean}
 */
export function exists(filePath) {
  return fs.existsSync(filePath);
}
