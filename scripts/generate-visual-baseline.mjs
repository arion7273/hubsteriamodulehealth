#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(__dirname, '../fixtures/defect-app/baselines/visual-regression.png');

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.goto('http://127.0.0.1:4177/fixtures/defect-app/visual-regression.html');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, await page.screenshot());
  await browser.close();
  console.log('Wrote', out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
