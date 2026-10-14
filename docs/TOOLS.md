# Testing engines (adapters)

Open-source tools run on the **scan runner** (Node host), not on Vercel static hosting.

## Bundled (npm)

| Tool | Package / version | License | Input modes |
|------|-------------------|---------|-------------|
| Playwright | `playwright@^1.49` | Apache-2.0 | URL, HTML |
| axe-core | `@axe-core/playwright@^4.10` | MPL-2.0 | URL, HTML |
| Lighthouse | `lighthouse@^12` | Apache-2.0 | URL only |
| Pixel compare | `pixelmatch`, `pngjs` | ISC / MIT | via Playwright pack |

## Repository (target repo `node_modules` + runner binaries)

| Tool | Detection | Notes |
|------|-----------|-------|
| ESLint | `eslint.config.js` / script | Lints `src` by default; uses repo config |
| TypeScript | `tsconfig.json` + `typescript` | `tsc --noEmit` |
| Vitest | `vitest` in devDependencies | Does not replace Jest projects (use existing `npm test` manually) |
| npm audit | npm lockfile | Advisory only — not confirmed exploit |
| Semgrep | `semgrep` binary | Falls back to `.semgrep/rules.yml` in repo |
| Gitleaks | `gitleaks` binary | Evidence redacted in reports |

## Opt-in (disabled by default)

| Tool | Enable | Notes |
|------|--------|-------|
| OWASP ZAP passive | `ZAP_PASSIVE_ENABLED=true`, `ZAP_API_URL` | Scoped URL crawl |
| k6 load | `K6_LOAD_ENABLED=true` + `k6` binary | Blocked on `production` environment |

## Status semantics

- **PASS / FAIL / BLOCKED / NOT_TESTED / NOT_APPLICABLE** — missing binary or unsupported input is never a pass.
- Scanner hits are flagged `scannerFinding` (not verified exploitable).

## Packs

See `engine/packs/definitions.mjs`. HTML-only mode does not offer repository packs as executable coverage.

## Runtime

- Node ≥ 20
- `npx playwright install chromium` on the runner
- Optional: `gitleaks`, `semgrep`, `k6` on PATH for full security/load packs
