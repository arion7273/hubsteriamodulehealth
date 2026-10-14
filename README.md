# hubsteriamodulehealth

**Module Health Suite** — extensive micro-checks, structured reports, and safe auto-fixes for Hubsteria modules.

## Quick start

```bash
npm run module:health
```

Reports are written to `reports/latest/`:

| File | Purpose |
|------|---------|
| `report.json` | Full machine-readable matrix |
| `REPORT.md` | Human summary + **Fix** CLI commands |
| `gaps.json` | Failures, blocked, and skips |
| `fixes.manifest.json` | Auto/assisted fixes with `cliFix` |
| `report.junit.xml` | CI annotations |

## Fix button (CLI)

Apply one check:

```bash
npm run module:health -- --fix --check-id=env.example.complete
```

Apply all safe auto-fixes (`auto`, high confidence, low risk):

```bash
npm run module:health -- --fix-all
```

Dry run:

```bash
npm run module:health -- --fix-all --dry-run
```

## Wire your modules

Edit `modules.manifest.json`:

```json
{
  "moduleId": "patients",
  "displayName": "Patients",
  "root": "../hubsteriaguardian/modules/patients",
  "requiredLayers": ["discovery", "static", "contract", "smoke"]
}
```

Map product claims in `docs/module-claims.json` (`checkId` ↔ requirement).

## Pilot

The included `examples/patients-stub` module intentionally fails several checks so you can see the report and run `--fix-all`.

## Adding checks

1. Add a row to `checks/registry.mjs` with stable `checkId`.
2. Optional: add handler in `fixes/registry.mjs` with matching `fixId`.
