# AI reporting & repair workspace

Greenfield subsystem on top of existing test engines. Measured pass/fail lives in `data/runs/`; workspace state in `data/workspace/{runId}.json`.

## Schema (v1)

| Layer | Location | Mutable by AI? |
|-------|----------|----------------|
| Raw run + evidence | `data/runs/{runId}.json` | No |
| Raw fingerprint | `engine/workspace/raw-run-fingerprint.mjs` | No |
| AI revisions | `data/workspace` + `data/ai-cache` | Analysis text only |
| Repairs / verification | `data/workspace` | Status via worker |

## API

- `GET /api/runs/:runId/workspace` — five views in one bundle
- `POST /api/runs/:runId/workspace/analyze` — queue or `force: true`
- `POST /api/runs/:runId/workspace/repair/plan` — `{ findingIds }`
- `POST /api/runs/:runId/workspace/repair/:repairId/patch`
- `POST /api/runs/:runId/workspace/repair/:repairId/verify`

Runs auto-queue AI analysis on worker completion when gateway is configured.

## UI

`/reports/:runId/workspace` — Overview, Issues, Repair, Verification, History.

Classic report remains at `/reports/:runId`.

## Test path

1. `npm run build:web && npm start`
2. Run workflow-gap-fixture (level 3 / workflow pack) or open existing run
3. Open **AI repair workspace**
4. **Analyze evidence** (uses existing Vercel AI Gateway env — key never sent to browser)
5. Select issues → **Repair plan** → Cursor prompt
6. Repository mode: set `meta.repoRoot` on run → **Generate patch**
7. **Verify** runs allowed `npm run verify:workflows` + optional retest for workflow-gap-fixture

## Limitations

- Remote repair worker: **unavailable** (local policy + optional AI patch only)
- Git worktree apply: patch stored as JSON files; full `git apply` UI pending
- GitHub PR: not wired — explicit future action
- URL mode: prompts only, no implied file repairs
- Verified fixed: only when retest comparison matches (workflow-gap-fixture path)
