# Cloud → cloud migration strategy

Move **Hubsteria Module Health** between hosts (Cloud Agent VM → Railway, Vercel UI + API VM → single Fly app, staging → production, etc.) without losing registry overlays, per-app settings, or report history.

## What moves vs what does not

| Asset | Migrates | How |
|-------|----------|-----|
| Built-in registry (`registry/apps.json`) | Git | Redeploy same commit |
| User-added apps / env URLs | **Bundle** | `registry.apps.json` overlay |
| Per-app tester settings | **Bundle** | `data/settings/*.json` |
| Run reports (trends, history) | **Bundle** (optional) | `data/runs/*.json` |
| Test account **secrets** | **Never in bundle** | Re-enter on target via `data/secrets.json` or host secrets |
| Playwright / Chromium | Target install | `npx playwright install chromium` on new API host |
| Vercel static UI | Redeploy | Set `VITE_API_BASE` to new API origin |

## Topology patterns

### A. Split UI + API (current Vercel pattern)

```
[Vercel: static web] --VITE_API_BASE--> [API VM: npm start + Playwright]
```

**Cutover:** deploy API on new VM → smoke test → update `VITE_API_BASE` + `CORS_ORIGINS` → redeploy Vercel.

### B. Single cloud host

```
[One VM/container: npm run build:web && npm start]
```

**Cutover:** export bundle from old host → import on new → DNS/port forward → drain old queue.

### C. Cloud Agent → long-lived host

Same as B; export before the Agent VM is discarded.

## Migration phases

### Phase 0 — Inventory (both sides)

On **source**:

```bash
npm run migrate:export -- --out ./migration-bundle.json --note "pre-cutover"
```

Record: API URL, `VITE_API_BASE`, `CORS_ORIGINS`, `PORT`, `HOST`, timezone in `registry/apps.json`.

### Phase 1 — Parallel (recommended)

1. Deploy target with same `main` commit.
2. `npm install && npx playwright install chromium && npm run build:web`
3. Import bundle on **target** with `--dry-run`, then without:

```bash
npm run migrate:import -- --in ./migration-bundle.json --merge
```

4. Manually copy **secrets** (account passwords) into target `data/secrets.json` — match `testAccountRefs` from registry.
5. Run `npm test` and one manual L1 scan against defect fixture.
6. Point **staging** UI at new API only (`VITE_API_BASE`); keep production on old API until green.

### Phase 2 — Cutover

1. Disable schedules on source (`schedules.enabled: false` in registry).
2. Wait for in-flight runs to finish (or cancel).
3. Final export from source (include `--runs` for full history).
4. Import on target with `--replace-runs` if you need a full history mirror.
5. Switch production `VITE_API_BASE` / DNS.
6. Enable schedules on target.

### Phase 3 — Validate

- Landing scan + Run test for each Hubsteria app URL.
- Compare latest report `gate` and finding counts to pre-migration baseline.
- Confirm **blocked** vs **fail** unchanged for auth-gated routes (expected).

### Rollback

- Revert `VITE_API_BASE` to previous API URL.
- Source VM kept read-only for 7 days with last export snapshot.

## Bundle format (version 1)

See `schemas/migration-bundle.schema.json`. Secrets are **excluded**; bundle lists `secretsAccountRefs` for manual checklist only.

## Environment variables (target)

| Variable | Purpose |
|----------|---------|
| `PORT` / `HOST` | Listen (default `4177` / `127.0.0.1`; use `0.0.0.0` behind reverse proxy) |
| `CORS_ORIGINS` | Comma-separated UI origins (Vercel URL) |
| `MIGRATION_TOKEN` | If set, required for `/api/migrate/*` |
| `VITE_API_BASE` | **Build-time** on UI host only |

## Operational limits after migration

- Run IDs are preserved on import; avoid importing the same bundle twice without `--merge` (skips duplicate run IDs).
- Comparable-run trends depend on history — import runs if you need continuity.
- HTML evidence paths inside findings are relative to the old host; re-run scans on the new host for fresh evidence.

## Commands

```bash
# Export (source cloud)
npm run migrate:export -- --out migration-bundle.json --runs --max-runs 500

# Validate bundle only
npm run migrate:import -- --in migration-bundle.json --dry-run

# Import (target cloud)
npm run migrate:import -- --in migration-bundle.json --merge

# API (optional, same host)
curl -H "Authorization: Bearer $MIGRATION_TOKEN" http://127.0.0.1:4177/api/migrate/export
```
