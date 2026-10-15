import crypto from 'node:crypto';
import { getAiGatewayConfig } from './ai-config.mjs';
import { redactForAi } from './ai-redact.mjs';
import { buildFindingCard } from './finding-card-model.mjs';

const ANALYSIS_SCHEMA_HINT = `Return a single JSON object:
{
  "summary": "2-4 sentences, plain language",
  "repairOrder": [{ "findingId": "string", "rationale": "string" }],
  "findingNotes": [{
    "findingId": "string",
    "userImpact": "string",
    "suspectedCause": "string (label as hypothesis if not confirmed)",
    "fixHint": "string",
    "confidence": "suggested" | "low" | "medium"
  }],
  "comparisonNote": "string or null",
  "limitations": ["string"],
  "referencedFindingIds": ["string"]
}
Rules: Do not invent file paths, selectors, or evidence not in the input. Do not claim issues are fixed. Do not rewrite pass/fail status.`;

/**
 * Cache key from open failures + run scope.
 * @param {object} report
 */
export function aiAnalysisCacheKey(report) {
  const cfg = getAiGatewayConfig();
  const fails = (report.findings ?? [])
    .filter((f) => f.status === 'fail')
    .map((f) => `${f.id}:${f.checkId}:${f.status}:${f.lastSeen ?? ''}`)
    .sort()
    .join('|');
  const scope = [
    report.runId,
    report.appId,
    report.meta?.targetUrl ?? '',
    JSON.stringify(report.packsExecuted ?? []),
    fails,
    cfg.model,
    cfg.analysisVersion,
  ].join('::');
  return crypto.createHash('sha256').update(scope).digest('hex').slice(0, 32);
}

/**
 * @param {object} report - normalized
 * @returns {Promise<object>}
 */
export async function generateAiReportAnalysis(report) {
  const cfg = getAiGatewayConfig();
  if (!cfg.enabled) {
    return disabledState('Set AI_GATEWAY_API_KEY or VERCEL_AI_API_KEY in the server environment.');
  }

  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const cards = fails.map((f) => buildFindingCard(f, report));
  const payload = {
    runId: report.runId,
    appId: report.appId,
    gate: report.gate,
    url: report.meta?.targetUrl,
    inputMode: report.inputMode,
    packsExecuted: report.packsExecuted,
    headline: report.headline,
    comparison: report.comparison?.changesSincePrevious?.counts ?? null,
    findings: cards.map((c) => ({
      findingId: c.findingId,
      checkId: c.checkId,
      title: c.title,
      severity: c.severity,
      expected: c.expected,
      actual: c.actual,
      evidence: c.evidence,
      remediation: c.recommendedFix,
      scannerFinding: c.scannerFinding,
    })),
  };

  const userContent = redactForAi(JSON.stringify(payload, null, 2));
  const systemContent = `You are a QA engineer assisting with Module Health reports. ${ANALYSIS_SCHEMA_HINT}`;

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI Gateway ${res.status}: ${errText.slice(0, 500)}`);
  }

  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

  const validated = validateAiAnalysis(parsed, report);
  const preliminary = Boolean(report.meta?.incomplete);

  return {
    status: preliminary ? 'preliminary' : 'complete',
    label: preliminary ? 'AI analysis (preliminary)' : 'AI analysis complete',
    message: validated.summary,
    analysisVersion: cfg.analysisVersion,
    model: cfg.model,
    provider: 'vercel-ai-gateway',
    generatedAt: new Date().toISOString(),
    cacheKey: aiAnalysisCacheKey(report),
    referencedFindingIds: validated.referencedFindingIds,
    repairOrder: validated.repairOrder,
    findingNotes: validated.findingNotes,
    comparisonNote: validated.comparisonNote,
    limitations: validated.limitations,
    raw: validated,
  };
}

function validateAiAnalysis(parsed, report) {
  const validIds = new Set((report.findings ?? []).map((f) => f.id));
  const referencedFindingIds = (parsed.referencedFindingIds ?? [])
    .filter((id) => validIds.has(id))
    .slice(0, 50);

  const repairOrder = (parsed.repairOrder ?? [])
    .filter((r) => validIds.has(r.findingId))
    .map((r) => ({
      findingId: r.findingId,
      rationale: String(r.rationale ?? '').slice(0, 500),
    }));

  const findingNotes = (parsed.findingNotes ?? [])
    .filter((n) => validIds.has(n.findingId))
    .map((n) => ({
      findingId: n.findingId,
      userImpact: String(n.userImpact ?? '').slice(0, 800),
      suspectedCause: String(n.suspectedCause ?? '').slice(0, 800),
      fixHint: String(n.fixHint ?? '').slice(0, 800),
      confidence: ['suggested', 'low', 'medium'].includes(n.confidence) ? n.confidence : 'suggested',
    }));

  return {
    summary: String(parsed.summary ?? '').slice(0, 2000),
    repairOrder,
    findingNotes,
    comparisonNote: parsed.comparisonNote ? String(parsed.comparisonNote).slice(0, 1000) : null,
    limitations: (parsed.limitations ?? []).map((l) => String(l).slice(0, 500)).slice(0, 10),
    referencedFindingIds: referencedFindingIds.length
      ? referencedFindingIds
      : repairOrder.map((r) => r.findingId),
  };
}

export function disabledState(message) {
  return {
    status: 'disabled',
    label: 'AI analysis disabled',
    message,
    analysisVersion: null,
    model: null,
    provider: null,
    referencedFindingIds: [],
  };
}

export function unavailableState(message) {
  return {
    status: 'unavailable',
    label: 'AI analysis unavailable',
    message,
    analysisVersion: getAiGatewayConfig().analysisVersion,
    model: null,
    provider: 'vercel-ai-gateway',
    referencedFindingIds: [],
  };
}

export function failedState(message) {
  return {
    status: 'failed',
    label: 'AI analysis failed',
    message: String(message).slice(0, 1000),
    analysisVersion: getAiGatewayConfig().analysisVersion,
    model: getAiGatewayConfig().model,
    provider: 'vercel-ai-gateway',
    referencedFindingIds: [],
  };
}

/**
 * Merge cached AI into reportFirst.aiAnalysis block.
 * @param {object} reportFirst
 * @param {object | null} cached
 * @param {object} config
 */
export function mergeAiIntoReportFirst(reportFirst, cached, config) {
  if (!config.enabled) {
    return { ...reportFirst, aiAnalysis: disabledState('Set AI_GATEWAY_API_KEY or VERCEL_AI_API_KEY on the server.') };
  }
  if (!cached) {
    return {
      ...reportFirst,
      aiAnalysis: {
        status: 'pending',
        label: 'AI analysis not run yet',
        message: 'Run AI analysis to get repair order and impact summaries. Raw tool results are unchanged.',
        analysisVersion: config.analysisVersion,
        model: config.model,
        provider: 'vercel-ai-gateway',
        referencedFindingIds: [],
      },
    };
  }
  return { ...reportFirst, aiAnalysis: cached };
}
