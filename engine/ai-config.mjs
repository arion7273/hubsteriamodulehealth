/**
 * Vercel AI Gateway (OpenAI-compatible). Keys via env only — never commit.
 */
export function getAiGatewayConfig() {
  const apiKey =
    process.env.AI_GATEWAY_API_KEY?.trim() ||
    process.env.VERCEL_AI_API_KEY?.trim() ||
    process.env.VERCEL_AI_GATEWAY_API_KEY?.trim() ||
    '';
  const model = process.env.AI_GATEWAY_MODEL?.trim() || 'openai/gpt-4o-mini';
  const baseUrl = (process.env.AI_GATEWAY_BASE_URL?.trim() || 'https://gateway.ai.vercel.app/v1').replace(
    /\/$/,
    '',
  );
  return {
    enabled: Boolean(apiKey),
    apiKey,
    model,
    baseUrl,
    analysisVersion: 'ai-report-v1',
  };
}
