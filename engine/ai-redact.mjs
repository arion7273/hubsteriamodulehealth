const PATTERNS = [
  { re: /\bvck_[A-Za-z0-9]+\b/g, replace: '[REDACTED_VERCEL_KEY]' },
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, replace: '[REDACTED_API_KEY]' },
  { re: /\bBearer\s+[A-Za-z0-9._-]+/gi, replace: 'Bearer [REDACTED]' },
  { re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replace: '[REDACTED_EMAIL]' },
  { re: /eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replace: '[REDACTED_JWT]' },
];

/**
 * @param {string} text
 */
export function redactForAi(text) {
  let out = String(text ?? '');
  for (const { re, replace } of PATTERNS) {
    out = out.replace(re, replace);
  }
  if (out.length > 120_000) out = `${out.slice(0, 120_000)}\n[TRUNCATED]`;
  return out;
}
