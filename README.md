# hubsteriamodulehealth

Multi-app tester and checker for Hubsteria applications: **five test levels**, honest reporting, schedules, and a dashboard. Reuses the original **module micro-check CLI** for filesystem module gates.

## Quick start

```bash
npm install
npx playwright install chromium
npm run build:web
npm start
```

Open **http://127.0.0.1:4177** — overview, run test, reports, schedules, per-app settings.

### CLI (no UI)

```bash
# Legacy module micro-checks (filesystem modules)
npm run module:health

# App-level browser checks
node scripts/run-app-test.mjs --app defect-fixture --env local --levels 1,4
```

### Daily / CI verification

```bash
npm test
```

Runs module stub checks + `verify:platform` against the **defect fixture** (broken link, JS error, mobile overflow, axe violations).

## Registered apps

- HubsteriaCare, HubsteriaBrew, HubsteriaClinic, HubsteriaGuardian (`registry/apps.json`)
- **Defect fixture** (internal) for proving the tester
- **Add apps** in the UI (Settings) or `POST /api/apps` with name + URL

Credentials stay in `data/secrets.json` (gitignored); registry only stores **account refs**.

## Test levels

| Level | Focus |
|-------|--------|
| 1 | Quick health — reachability, links, JS errors, first-party network |
| 2 | Module check — filesystem checks + inventory; live mutations need config |
| 3 | Workflow recipes — templates in `registry/workflows/templates.json` (unconfigured until adapted) |
| 4 | Quality — viewports, overflow, axe (not full a11y certification) |
| 5 | Resilience/load — blocked on production; Phase D |

## Input modes

- **Live URL** — with origin guard and local-runner policy (`registry/apps.json` → `global`)
- **HTML snapshot** — isolated `setContent`; scope banner in report; no backend/auth claims
- **Authenticated URL** — account refs + secrets (wire credentials in `data/secrets.json`; execution hooks Phase B)

## Reports

Stored under `data/runs/`. Each report includes:

- Executed vs configured modules (honest headline)
- pass / fail / blocked / not_tested counts
- Trends vs previous comparable run
- **Copy Cursor fix prompt** per finding (API + UI)

## Implementation status

See `docs/IMPLEMENTATION_LEDGER.md`.

## Operating limits

- Playwright runs on the server host; long jobs use an in-process queue (`maxConcurrentRuns`).
- Production targets: read-only by default; mutating workflows need `mutationsAllowed` on staging.
- Visual baselines and load tests are not fully implemented (Phase C/D).
