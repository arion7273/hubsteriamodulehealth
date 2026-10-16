/**
 * Resolve {{testData.key}} and {contextKey} placeholders (no eval).
 */
export function interpolateString(template, ctx) {
  if (template == null) return template;
  let s = String(template);
  s = s.replace(/\{\{testData\.([a-zA-Z0-9_]+)\}\}/g, (_, k) => ctx.testData?.[k] ?? '');
  s = s.replace(/\{runId\}/g, ctx.runId ?? '');
  s = s.replace(/\{baseUrl\}/g, ctx.baseUrl ?? '');
  s = s.replace(/\{variant\}/g, ctx.variant ?? 'fixed');
  s = s.replace(/\{role\}/g, ctx.role ?? 'staff');
  return s;
}

export function buildTestData(recipe, ctx) {
  const runId = ctx.runId ?? 'run_local';
  const out = { runId };
  for (const [k, v] of Object.entries(recipe.testData ?? {})) {
    out[k] = interpolateString(v, { ...ctx, testData: out, runId });
  }
  return out;
}
