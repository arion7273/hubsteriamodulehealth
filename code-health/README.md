# Code Health Audit (reusable)

Shared runner under `code-health/core` with repository-specific config in `code-health/config/<repo>.mjs`.

## Commands (this repository)

```bash
npm run health:audit      # Full scan → reports + CODE_HEALTH_BACKLOG.md
npm run health:compare    # Compare latest.json to baseline.json
npm run health:plan       # Recommended cleanup batch (JSON)
npm run health:baseline   # Save baseline (requires --force to overwrite)
```

Options via CLI:

```bash
node scripts/code-health-cli.mjs audit --skip-bundle
node scripts/code-health-cli.mjs baseline --force
```

## Outputs

| Path | Description |
| --- | --- |
| `reports/code-health/latest.json` | Structured findings |
| `reports/code-health/latest.html` | Human-readable report |
| `reports/code-health/baseline.json` | Saved baseline (explicit command only) |
| `CODE_HEALTH_BACKLOG.md` | Actionable backlog with stable IDs |

## Port to another repository

1. Copy `code-health/core` and `code-health/scanners`.
2. Add a new `code-health/config/<your-repo>.mjs` (entry points, knip project globs, eslint/tsc targets, exclusions).
3. Point `scripts/code-health-cli.mjs` at your config (or pass `CODE_HEALTH_CONFIG` env in a thin wrapper).
4. Pin `jscpd` and `knip` in `devDependencies`.
5. Run `health:audit`, review backlog, then `health:baseline --force` when accepting current debt.

Do not treat Cursor environment snapshot builds as git content; this audit scans source only.
