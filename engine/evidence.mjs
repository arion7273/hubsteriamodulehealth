import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EVIDENCE_ROOT = path.join(__dirname, '../data/evidence');

function evidenceDirForRun(runId) {
  const dir = path.join(EVIDENCE_ROOT, runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function captureScreenshot(page, runId, name) {
  const dir = evidenceDirForRun(runId);
  const file = path.join(dir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return { type: 'screenshot', path: file.replace(path.join(__dirname, '..') + path.sep, '') };
}

export async function captureSanitizedDom(page, runId, name = 'dom') {
  const html = await page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script, style').forEach((n) => n.remove());
    const text = clone.outerHTML || '';
    return text.slice(0, 80_000);
  });
  const dir = evidenceDirForRun(runId);
  const file = path.join(dir, `${name}.html`);
  fs.writeFileSync(file, html, 'utf8');
  return { type: 'dom', path: file.replace(path.join(__dirname, '..') + path.sep, ''), bytes: html.length };
}
