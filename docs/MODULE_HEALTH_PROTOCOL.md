# Module Health Protocol

This document describes conventions enforced by the Module Health Suite micro-checks.

## Required scripts

- `verify` — fast module-local gate
- `test:smoke` — runtime smoke atoms

## Security

- Document all `process.env.*` keys in `.env.example` (no secret values).
- Never reference service role keys under client paths (`src/components`, `src/settings`, `src/portal`).

## Schema

- SQL migrations live under `supabase/migrations/`.
- PHI tables must enable RLS in migrations.

## API contract

- `src/api/routes.json` lists HTTP routes.
- `/health` must be declared and return `{ ok: true }` from `src/api/health.mjs`.

## Portal

- Settings UI at `src/settings.tsx` or `src/settings/index.tsx` with an `<h1>`.

## Reports

Run from repo root:

```bash
npm run module:health
npm run module:health -- --fix-all
npm run module:health -- --fix --check-id=smoke.health.endpoint
```

Artifacts: `reports/latest/report.json`, `REPORT.md`, `gaps.json`, `fixes.manifest.json`.
