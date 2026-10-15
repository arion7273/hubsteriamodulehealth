import { presetToRunTestQuery, RUN_PRESETS } from './run-presets.mjs';

/**
 * Cursor prompt for full gap / release-gate review — any registered app, local or hosted Module Health.
 *
 * @param {object} opts
 * @param {object} opts.app - registry app entry
 * @param {string} opts.moduleHealthApiBase - API origin (no trailing slash), e.g. https://my-scanner.up.railway.app or https://hubsteriamodulehealth.vercel.app when SCANNER_API_ORIGIN is set
 * @param {string} [opts.uiOrigin] - where the dashboard is opened (for human context)
 * @param {string} [opts.environment] - registry environment id
 * @param {string} [opts.targetUrl] - live URL to scan
 * @param {string} [opts.repoRoot] - repository path on the scan runner
 * @param {string[]} [opts.priorRunIds] - existing Module Health run IDs to include
 * @param {object} [opts.latestReport] - optional normalized report to anchor Part A
 */
export function buildComprehensiveAuditPrompt(opts) {
  const {
    app,
    moduleHealthApiBase,
    uiOrigin,
    environment = 'production',
    targetUrl,
    repoRoot,
    priorRunIds = [],
    latestReport,
  } = opts;

  const appName = app?.name ?? app?.id ?? 'the application';
  const appId = app?.id ?? 'unknown-app';
  const envEntry = app?.environments?.find((e) => e.id === environment);
  const resolvedUrl = targetUrl ?? envEntry?.baseUrl ?? app?.baseUrl ?? '(set target URL for this environment)';
  const resolvedRepo = repoRoot ?? app?.repositoryPath ?? '(set repositoryPath on the app or repoRoot on the run)';

  const urlPreset = RUN_PRESETS['comprehensive-build-url'];
  const repoPreset = RUN_PRESETS['comprehensive-build-repo'];

  const apiNote =
    moduleHealthApiBase.includes('localhost') || moduleHealthApiBase.includes('127.0.0.1')
      ? 'Local full stack (`npm run start:prod`).'
      : 'Hosted Module Health API (Railway/Render Docker URL, or Vercel UI with `SCANNER_API_ORIGIN` proxying `/api`).';

  const lines = [
    `# Comprehensive gap & critical-issues review — ${appName}`,
    '',
    'Use this prompt in **the target application\'s source repository** in Cursor (not only Module Health), after Module Health runs exist for the scopes below.',
    '',
    '## Context',
    `- **Application:** ${appName} (registry \`appId\`: \`${appId}\`)`,
    `- **Environment:** ${environment}${envEntry?.label ? ` (${envEntry.label})` : ''}`,
    `- **Module Health API base:** ${moduleHealthApiBase} — ${apiNote}`,
    uiOrigin ? `- **Dashboard UI opened at:** ${uiOrigin}` : null,
    `- **Live URL for scans:** ${resolvedUrl}`,
    `- **Repository path on scan runner:** ${resolvedRepo}`,
    app?.description ? `- **Description:** ${app.description}` : null,
    priorRunIds.length ? `- **Existing run IDs to use:** ${priorRunIds.join(', ')}` : null,
    latestReport?.runId ? `- **Latest run ID (anchor):** ${latestReport.runId} (gate: ${latestReport.gate})` : null,
    '',
    '---',
    '',
    '## Part A — Automated (Module Health)',
    '',
    '1. Confirm the API is up: `GET {API_BASE}/api/health` → `{ "ok": true }`.',
    '   - **Local:** `http://localhost:4177`',
    '   - **Web UI same-origin:** use the origin where you open the dashboard (e.g. Vercel); `/api` must reach the scanner (`SCANNER_API_ORIGIN` or `VITE_API_BASE`).',
    '   - **Single-host deploy:** use that host for both UI and API.',
    '',
    '2. If no recent runs exist, enqueue runs via `POST {API_BASE}/api/runs` (or the Run test UI with presets):',
    '',
    '   **A. Live URL (does not prove repo security)**',
    `   - appId: \`${appId}\``,
    `   - environment: \`${environment}\``,
    '   - inputMode: `url`',
    `   - targetUrl: \`${resolvedUrl}\``,
    `   - packs: \`${(urlPreset.packs ?? []).join('`, `')}\``,
    `   - levels: ${(urlPreset.levels ?? [1, 4]).join(', ')}`,
    `   - UI shortcut: \`${presetToRunTestQuery(appId, 'comprehensive-build-url')}\``,
    '',
    '   **B. Repository (does not prove live production behavior)**',
    `   - appId: \`${appId}\``,
    `   - environment: \`${environment}\``,
    '   - inputMode: `repository`',
    `   - repoRoot: \`${resolvedRepo}\` (path must exist on the machine running the scanner)`,
    `   - packs: \`${(repoPreset.packs ?? []).join('`, `')}\``,
    `   - levels: ${(repoPreset.levels ?? [2]).join(', ')}`,
    `   - UI shortcut: \`${presetToRunTestQuery(appId, 'comprehensive-build-repo')}\``,
    '',
    '3. Pull reports: `GET {API_BASE}/api/runs/{runId}` for each run. Optionally `POST {API_BASE}/api/runs/{runId}/gap-analysis-prompt` for a machine-generated fix bundle.',
    '',
    '4. Summarize from **report JSON only**:',
    '   - gate (`ship` | `fix_blockers` | `fix_issues` | `investigate_blocked`)',
    '   - `executiveSummary.items` (blockers → highs → mediums)',
    '   - `structured.sections` (defects, runner failures, review, blocked, not_executed)',
    '   - `coverage.categories` — what was **not** run (honest scope)',
    '   - `toolInventory` — which engines executed vs skipped',
    '',
    '---',
    '',
    '## Part B — Static / product gaps (Cursor analysis on this workspace)',
    '',
    'Ground only in **this repository** and **Module Health report JSON** — do not invent paths or test outcomes.',
    '',
    '5. Map product claims vs implementation for this app: authentication/authorization, sensitive data handling, critical user workflows, module boundaries, error handling, observability.',
    '6. List **blockers** and **critical/high** issues with: severity, user impact, evidence (file paths and/or report `checkId` / `findingId`), concrete fix steps.',
    '7. List **“not tested but should be”** gaps (missing tests, monitors, runbooks, staging-only workflows) **separate** from confirmed Module Health fails.',
    '',
    '---',
    '',
    '## Output format (required)',
    '',
    '- **Executive summary** (≤10 bullets)',
    '- **Blockers** (must fix before ship)',
    '- **Critical / high**',
    '- **Medium / debt**',
    '- **Coverage gaps** (what Module Health did not run for this app)',
    '- **Recommended next runs** (exact config: `appId`, `environment`, `inputMode`, `levels`, `packs`, `targetUrl` and/or `repoRoot`, and `{API_BASE}`)',
    '',
    '---',
    '',
    '## Registry modules (inventory only — not proof of test coverage)',
    '',
  ];

  const modules = app?.modules ?? [];
  if (!modules.length) {
    lines.push('- (No modules registered for this app.)');
  } else {
    for (const m of modules) {
      lines.push(`- **${m.label}** (\`${m.id}\`): routes ${(m.routes ?? []).join(', ') || '—'}; status ${m.status ?? '—'}`);
    }
  }

  if (latestReport) {
    lines.push('', '## Latest report snapshot (anchor)', '', '```json');
    lines.push(
      JSON.stringify(
        {
          runId: latestReport.runId,
          gate: latestReport.gate,
          headline: latestReport.headline,
          executiveSummary: latestReport.executiveSummary,
          summary: latestReport.summary,
          coverage: latestReport.coverage
            ? {
                profileLabel: latestReport.coverage.profileLabel,
                categories: latestReport.coverage.categories,
              }
            : null,
        },
        null,
        2,
      ),
    );
    lines.push('```');
  }

  lines.push(
    '',
    'Replace `{API_BASE}` with:',
    moduleHealthApiBase,
  );

  return lines.filter((l) => l !== null).join('\n');
}

/**
 * Resolve public API base for prompts when UI is on Vercel or local.
 * @param {import('express').Request} [req]
 */
export function resolveModuleHealthApiBase(req) {
  const fromBody = req?.body?.moduleHealthApiBase?.replace(/\/$/, '');
  const fromQuery = req?.query?.apiBase?.replace(/\/$/, '');
  const fromEnv = process.env.MODULE_HEALTH_PUBLIC_URL?.replace(/\/$/, '');
  if (fromBody) return fromBody;
  if (fromQuery) return fromQuery;
  if (fromEnv) return fromEnv;
  const host = req?.get?.('x-forwarded-host') || req?.get?.('host');
  const proto = req?.get?.('x-forwarded-proto') || 'http';
  if (host && !host.includes('localhost')) return `${proto}://${host}`.replace(/\/$/, '');
  const port = process.env.PORT ?? 4177;
  return `http://127.0.0.1:${port}`;
}
