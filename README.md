# hubsteriamodulehealth

Multi-app tester and checker for Hubsteria applications: **five test levels**, honest reporting, schedules, and a dashboard. Reuses the original **module micro-check CLI** for filesystem module gates.

## Quick start

```bash
npm install
npx playwright install chromium
npm run build:web
npm start
```

Open **http://localhost:4177** (or **http://127.0.0.1:4177**) — landing URL scan, then dashboard at `/overview`.

**Localhost scans:** `localRunnerEnabled` is on in `registry/apps.json`. Use `http://localhost:PORT` (not `https`) for local apps. The landing page includes localhost shortcuts and picks `http://` automatically for `localhost` / `127.0.0.1`.

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

## Cloud → cloud migration

Moving between Cloud Agent VMs, Vercel + API split, or Railway/Fly hosts:

1. **Export** on source: `npm run migrate:export -- --out migration-bundle.json --runs`
2. **Import** on target: `npm run migrate:import -- --in migration-bundle.json --merge`
3. Re-enter **secrets** manually (`data/secrets.json`); bundles never contain passwords.
4. Update **`VITE_API_BASE`** / **`CORS_ORIGINS`** and redeploy UI.

Full runbook: [docs/CLOUD_TO_CLOUD_MIGRATION.md](docs/CLOUD_TO_CLOUD_MIGRATION.md).

## Deploy (scans on Vercel previews)

**Vercel Root Directory:** `web` (`web/vercel.json` → static Vite build).

Scans need a Playwright host. **Fastest:** deploy the repo **`Dockerfile`** on Railway or Render and use that URL for everything — see **[docs/DEPLOY.md](docs/DEPLOY.md)**.

**Vercel + scanner:** deploy the Docker image, then set Vercel env **`SCANNER_API_ORIGIN`** to the scanner HTTPS origin and redeploy. Edge middleware proxies `/api` to the scanner.

Local all-in-one: `npm run start:prod` → http://localhost:4177

## Operating limits

- Playwright runs on the server host; long jobs use an in-process queue (`maxConcurrentRuns`).
- Production targets: read-only by default; mutating workflows need `mutationsAllowed` on staging.
- Visual baselines and load tests are not fully implemented (Phase C/D).
