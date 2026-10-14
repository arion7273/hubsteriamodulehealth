# Implementation ledger

| Area | Status | Notes |
|------|--------|-------|
| Legacy module micro-checks (CLI) | IMPLEMENTED_VERIFIED | `npm run module:health` |
| Multi-app registry | IMPLEMENTED_VERIFIED | `registry/apps.json` + API + UI |
| URL input + origin guard | IMPLEMENTED_VERIFIED | Level 1 against fixture |
| HTML snapshot input | IMPLEMENTED_VERIFIED | Isolated Playwright context |
| Level 1 quick health | IMPLEMENTED_VERIFIED | Fixture defect detection |
| Level 2 module checks | IMPLEMENTED_UNVERIFIED | Filesystem module checks + browser stubs |
| Level 3 workflow recipes | IMPLEMENTED_UNVERIFIED | Templates marked unconfigured |
| Level 4 quality (a11y/viewport/visual) | IMPLEMENTED_VERIFIED | `verify:adapters` — axe, viewports, pixel baseline |
| Level 5 resilience/load | IMPLEMENTED_UNVERIFIED | k6 adapter opt-in (`K6_LOAD_ENABLED`) |
| Daily schedules | IMPLEMENTED_UNVERIFIED | Pack rotation + weekly repo cron when configured |
| Run history + diff | IMPLEMENTED_VERIFIED | Comparable-run comparison in reports |
| Dashboard UI | IMPLEMENTED_VERIFIED | Overview, run, reports, settings |
| Credentials server-side | IMPLEMENTED_VERIFIED | `data/secrets.json` gitignored; refs only in registry |
| Defect fixture app | IMPLEMENTED_VERIFIED | `fixtures/defect-app/` |
| Cloud → cloud migration | IMPLEMENTED_VERIFIED | `migrate:export` / `migrate:import`, `docs/CLOUD_TO_CLOUD_MIGRATION.md` |
| Browser session + readiness | IMPLEMENTED_VERIFIED | `engine/browser-session.mjs`, `l1.readiness.application` |
| Structured report sections | IMPLEMENTED_VERIFIED | `structured` on report + ReportDetail UI |
| Targeted retest API | IMPLEMENTED_UNVERIFIED | `POST /api/runs/:id/retest` |
| Test pack adapters (Playwright, axe, Lighthouse, repo tools) | IMPLEMENTED_VERIFIED | `npm run verify:adapters`; see `docs/TOOLS.md` |
| ZAP passive / k6 production load | IMPLEMENTED_UNVERIFIED | Disabled by default; manual workflow `.github/workflows/adapter-engines.yml` |
| Isolated worker processes | IMPLEMENTED_UNVERIFIED | In-process queue; spawn without shell for repo tools |
