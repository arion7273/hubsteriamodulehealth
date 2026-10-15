# QA audit report (QAV5 / PDF-style export)

**Ultimate flow:** open Module Health → paste **any URL** on the landing page → view report → **Open printable HTML** (Save as PDF). No registered app required.

Reference template: **QAV5** (`engine/qa-audit-v5-reference.mjs`). Optional reference file: `web/public/references/qav5.pdf`.

Module Health can produce a **consultant-style QA audit** from every run — not only a pass/fail table.

## What you get (like the HubsteriaBrew V3 PDF)

| PDF section | Module Health |
|-------------|----------------|
| Executive summary & overall health | `qaAudit.executiveNarrative` + gate |
| Scorecard (severity counts) | Scorecard cards in UI + export |
| Findings by category (Functional, A11y, Security, …) | `findingsByCategory` from check IDs |
| Top concerns / prioritized fix list | `topConcerns`, `topFixList` |
| Tools used | Tool inventory appendix |
| Testing limitations | Coverage gaps + honest scope (Appendix F) |
| Recommended next runs | Comprehensive build presets |

## What still requires human QA (or more packs)

The Brew V3 PDF includes **hundreds** of manual functional cases (logged-in flows, money reconciliation, claim cross-check). Module Health automates **engines** (Playwright, axe, ESLint, …). To approach that depth:

1. Run **`comprehensive-build-url`** and **`comprehensive-build-repo`** presets.
2. Configure **Level 3 workflows** and test accounts for authenticated flows.
3. Export **HTML → Print to PDF** from the report page.
4. Optionally paste **Copy comprehensive audit prompt** into Cursor for product-gap analysis on top of the JSON.

## How to open

On any report: **QA audit report (V3-style export)** → **Open printable HTML** or **Download Markdown**.

API: `GET /api/runs/{runId}/audit.html` · `GET /api/runs/{runId}/audit.md`

Re-open a report or restart `npm start` so older runs get `qaAudit` attached on read via `normalizeRunReport`.
