# Implementation ledger

| Area | Status | Notes |
|------|--------|-------|
| Legacy module micro-checks (CLI) | IMPLEMENTED_VERIFIED | `npm run module:health` |
| Multi-app registry | IMPLEMENTED_VERIFIED | `registry/apps.json` + API + UI |
| URL input + origin guard | IMPLEMENTED_VERIFIED | Level 1 against fixture |
| HTML snapshot input | IMPLEMENTED_VERIFIED | Isolated Playwright context |
| Level 1 quick health | IMPLEMENTED_VERIFIED | Fixture defect detection |
| Level 2 module checks | IMPLEMENTED_UNVERIFIED | Filesystem module checks + browser stubs |
| Level 3 workflow recipes | IMPLEMENTED_UNVERIFIED | Templates until app-specific recipes configured |
| Level 4 quality (a11y/viewport/visual) | IMPLEMENTED_VERIFIED | `verify:adapters` |
| Level 5 recovery + k6 pack | IMPLEMENTED_VERIFIED | `verify:adapters` recovery + k6 blocked default |
| Daily schedules | IMPLEMENTED_VERIFIED | Pack rotation + weekly repo cron in `scheduler.mjs` |
| Run history + diff | IMPLEMENTED_VERIFIED | Comparable-run comparison in reports |
| Dashboard UI | IMPLEMENTED_VERIFIED | Overview, run, reports, settings |
| Credentials server-side | IMPLEMENTED_VERIFIED | `data/secrets.json` gitignored |
| Defect fixture app | IMPLEMENTED_VERIFIED | `fixtures/defect-app/` |
| Cloud → cloud migration | IMPLEMENTED_VERIFIED | export/import tooling |
| Browser session + readiness | IMPLEMENTED_VERIFIED | readiness gate |
| Structured report sections | IMPLEMENTED_VERIFIED | ReportDetail + tools executed |
| Targeted retest API | IMPLEMENTED_VERIFIED | Preserves packs + repo path |
| Test pack adapters | IMPLEMENTED_VERIFIED | `npm run verify:adapters` |
| ZAP passive client | IMPLEMENTED_VERIFIED | Real ZAP JSON API; blocked unless enabled |
| Isolated worker processes | IMPLEMENTED_VERIFIED | `server/worker-run.mjs` child per run |
| Pack settings UI | IMPLEMENTED_VERIFIED | Settings page per-pack toggles |
| Evidence viewer | IMPLEMENTED_VERIFIED | `/api/files` + `EvidencePreview` |
| Finding dedupe + tool provenance | IMPLEMENTED_VERIFIED | `dedupeFindings` |
| Jest + pnpm/yarn audit | IMPLEMENTED_VERIFIED | `jest-repo` + `dependency-audit` adapter |
