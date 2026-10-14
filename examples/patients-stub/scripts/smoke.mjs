import { getHealth } from '../src/api/health.mjs';
const h = await getHealth();
if (!h?.ok) {
  console.error('smoke failed', h);
  process.exit(1);
}
console.log('smoke ok');
