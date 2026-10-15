#!/usr/bin/env node
/**
 * Smoke test Vercel AI Gateway for report analysis. Requires AI_GATEWAY_API_KEY or VERCEL_AI_API_KEY.
 * Usage: node scripts/test-ai-gateway.mjs [runId]
 */
import { loadEnvFile } from '../server/load-env.mjs';
loadEnvFile();

import { getAiGatewayConfig } from '../engine/ai-config.mjs';
import { getRun } from '../server/storage.mjs';
import { generateAiReportAnalysis } from '../engine/ai-report-analysis.mjs';

const cfg = getAiGatewayConfig();
if (!cfg.enabled) {
  console.error('FAIL: No AI_GATEWAY_API_KEY or VERCEL_AI_API_KEY in .env or environment.');
  process.exit(1);
}

const runId = process.argv[2] ?? 'run_90d1dfb652e8c6ba1941';
const report = getRun(runId);
if (!report) {
  console.error(`FAIL: Run not found: ${runId}`);
  process.exit(1);
}

console.log(`Testing AI Gateway model=${cfg.model} run=${runId} fails=${(report.findings ?? []).filter((f) => f.status === 'fail').length}`);

try {
  const result = await generateAiReportAnalysis(report);
  console.log('OK: status=', result.status);
  console.log('Summary:', (result.message ?? '').slice(0, 200));
  console.log('Referenced findings:', result.referencedFindingIds?.length ?? 0);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
