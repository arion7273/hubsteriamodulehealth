# Workflow gap tester — capabilities

Branch tested: see `git rev-parse HEAD` at verify time.

## Capability matrix

| Area | Status | Notes |
|------|--------|-------|
| L1 URL health | **VERIFIED** | `verify:platform`, defect fixture |
| L4 axe/Lighthouse | **VERIFIED** | `verify:adapters` |
| L3 workflow executor | **VERIFIED** | `verify:workflows` on workflow-gap-fixture |
| L3 Hubsteria Care/Brew/Clinic/Guardian templates | **BLOCKED** | `configured: false` — needs URLs, secrets, recipes |
| Expected-behavior manifest | **IMPLEMENTED_UNVERIFIED** | `registry/expected-behavior/*.json` |
| Gap classification in UI | **PARTIAL** | `meta.gapClass` on workflow findings |
| Repository code-quality pack | **VERIFIED** | adapter-fixture |
| Run comparison / repair prompts | **VERIFIED** | `verify:comparison`, `verify:reports` |

A successful Playwright launch or adapter preflight is **not** a workflow pass. Only step assertions with outcomes count.

## Workflow-gap-fixture (vertical slice)

App id: `workflow-gap-fixture`. Recipes: `registry/workflows/recipes/gap-*.json`.

Demonstration path:

1. `npm start`
2. `npm run verify:workflows`
3. Or run app `workflow-gap-fixture` with pack `workflow` / level 3.

## Hubsteria apps (one-app rule)

Only **workflow-gap-fixture** has executable L3 recipes in this repo. Other apps remain **BLOCKED** with setup notes in `registry/workflows/templates.json`.

To enable Clinic (example):

1. Add `registry/expected-behavior/hubsteria-clinic.json`
2. Add recipe JSON with real selectors and `data/secrets.json` accounts
3. Set `configured: true` on template and `criticalWorkflows` on app

## Milestone log

### M1 — Executor + fixture (current)

- **Executes:** navigate, click, fill, assertions, persistence, network wait, screenshots on failure
- **Evidence:** `data/artifacts/{runId}/{workflowId}/`
- **Verify:** `npm run verify:workflows`
- **Blockers:** Hubsteria production apps need external URLs/credentials

### M2 — Next

- Wire expected-behavior gaps into report-first / QA export sections
- Clinic/Brew single-app recipes when credentials supplied
- Retest linkage for workflow checkIds
