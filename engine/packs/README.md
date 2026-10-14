# Selectable test packs

Packs are defined in `definitions.mjs` and selected via `runRequest.packs` or the Run test UI.

| Pack ID | Label | Input modes |
|---------|-------|-------------|
| `quick-health` | Quick Health | url, html |
| `ui-a11y` | UI & Accessibility | url, html |
| `workflow` | Workflow | url |
| `code-quality` | Code Quality | repository |
| `security` | Security | repository, url (ZAP) |
| `load-recovery` | Load & Recovery | url |

Execution flows through `engine/packs/executor.mjs` into tool adapters under `engine/adapters/`. Runs execute in an isolated child process (`server/worker-run.mjs`).

Per-app pack toggles and advanced tool flags live in `data/settings/<appId>.json` (editable in Settings UI).
