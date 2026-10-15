# Comprehensive build verification

Two presets mirror a full **build gate** without claiming repository coverage from URL-only runs.

| Preset ID | Input | Packs | What it proves |
|-----------|--------|-------|----------------|
| `comprehensive-build-url` | Live URL | `quick-health`, `ui-a11y` | Rendered app health, links, JS errors, UI/a11y (L1/L4) |
| `comprehensive-build-repo` | Repository path on runner | `code-quality`, `security` | Lint, types, tests, secrets, dependency audit |

Run **both** for any registered app: URL against the chosen environment, repository against a checkout on the scan runner (set `repositoryPath` on the app or pass `repoRoot`).

## UI

- **App detail** → primary link **Comprehensive build verification (URL)**.
- **Run test** → preset dropdown or `?preset=comprehensive-build-url&app=hubsteria-care`.

## Report

- **Executive summary** — blockers/highs/mediums with remediation and retest hints.
- **Copy gap analysis prompt** — whole-run Cursor prompt via `POST /api/runs/:runId/gap-analysis-prompt`.
