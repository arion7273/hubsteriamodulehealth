/**
 * Shared API base resolution for comprehensive-audit prompt routes.
 * @param {import('express').Request} req
 * @param {Record<string, unknown>} body
 * @param {() => string} resolveModuleHealthApiBase
 */
export function resolvePromptApiBase(req, body, resolveModuleHealthApiBase) {
  return (
    body.moduleHealthApiBase?.replace(/\/$/, '') ||
    body.uiOrigin?.replace(/\/$/, '') ||
    resolveModuleHealthApiBase(req)
  );
}
