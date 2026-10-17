# Build Checkup Report

**Report ID:** `build-checkup-20261016`  
**Generated:** 2026-10-16 (America/Los_Angeles)  
**Mode:** Report-only — no application fixes, no checkpoint advance, no git write operations.

---

## Recommendation: **FIX FIRST**

Integrate with **`origin/main`** (you are **diverged**), revert or reconcile the **workflow fixture** change that breaks the repair E2E contract, and get **`verify:repair-e2e`** green before treating this line as shippable. **`npm test`** and **production web build** passed on the **dirty** working tree, but that is not full verification.

---

## Baseline and tested state

| Item | Value |
| --- | --- |
| **Saved checkpoint** | **Missing** — see `CHECKPOINT.md` |
| **Adopted baseline (Option A)** | `1fab6c371b4764d04e24b165948138c7afea41fd` |
| **HEAD SHA (committed)** | `5831549e9cf77262e512ebd27a590c65807314b3` |
| **Branch** | `main` |
| **Commits `baseline..HEAD`** | **1** (`5831549` — L3 workflow gap testing, repair workspace, report decision layer) |
| **Ancestor check** | Baseline **is** ancestor of HEAD ✓ |
| **Tested application state** | **Dirty working tree** at `5831549` + unstaged + listed untracked source (not a single git SHA) |
| **`origin/main` @ fetch** | `81434e35e863c2feb2743737f1fb6817cdf84e00` (merge PR #10) — **not** ancestor of local HEAD |

### Changed files since baseline `1fab6c3`

**Committed (`1fab6c3..5831549`):** 67 files, +4270 / −102 lines (L3 workflows, repair workspace, report-first UI, verify scripts, docs). Full list: `git diff --stat 1fab6c3..5831549`.

### Working tree (separate buckets)

**Staged:** none  

**Unstaged (tracked) — 28 files:**

| Area | Paths |
| --- | --- |
| Engine / scans | `engine/adapters/{axe,lighthouse,playwright-live}.mjs`, `engine/browser-session.mjs`, `engine/readiness.mjs`, `engine/content-frame.mjs` (new, untracked), `engine/playwright-preflight.mjs` (new), `engine/levels/level{1,4}*.mjs`, `engine/repair-plan.mjs`, `engine/report-execution.mjs`, `engine/run-*.mjs`, `engine/cursor-repair-prompt.mjs`, `engine/finding-*.mjs`, `engine/fix-playbooks.mjs` |
| Server | `server/index.mjs` |
| Web UI | `web/src/pages/{Landing,RunTest}.jsx`, `web/src/components/ReportFirstPanel.jsx` |
| Config / registry | `package.json`, `registry/apps.json` |
| Tests | `scripts/verify-report-consistency.mjs`, `fixtures/workflow-app/create.html` |
| Tooling (non-app) | `.codex/`, `.github/copilot-instructions.md`, `.vexp/manifest.json`, `.vscode/mcp.json`, `AGENTS.md` |

**Untracked source (relevant):**

| Path | Notes |
| --- | --- |
| `engine/content-frame.mjs` | Iframe-shell readiness / Lighthouse URL resolution |
| `engine/playwright-preflight.mjs` | Chromium preflight |
| `fixtures/iframe-shell/` | Iframe readiness regression fixture |

**Untracked runtime / out of scope for app SHA:** `data/workspace/*.json`, `data/repair-backups/`, `data/repair-worktrees/`

**Sibling repo (not this tree):** `hubsteriabrew/public/reference-landing/spa.html` has local nav landmark change — **not** included in this repo’s git status.

---

## 1. Delivery status

| Stage | Status | Evidence |
| --- | --- | --- |
| Uncommitted app code | **Yes** — large unstaged delta | `git status` |
| Committed locally | **Yes** — `5831549` (1 commit since `1fab6c3`) | `git log` |
| Pushed to `origin/main` | **No** — local `main` **diverged** | `git log HEAD..origin/main` → 7 commits; `origin/main..HEAD` → `5831549` |
| PR open for local commit | **UNKNOWN** — no PR found for `5831549` | `gh pr list` not queried for unpushed SHA |
| CI on **`origin/main`** | **Passed** @ `81434e3` | GitHub Actions `38834769492` (merge PR #10) |
| CI on **local `5831549`** | **UNKNOWN** — not on remote | — |
| CI on **dirty working tree** | **Not run** | — |
| Deployed production SHA | **UNKNOWN** | No deploy hook matched to local tree |

Squash/rebase: PR #10 merged to `81434e3`; local `5831549` is a **parallel** commit on shared parent `1fab6c3` — integrate before push.

---

## 2. Code health (checks)

| Check | Result | Evidence |
| --- | --- | --- |
| Typecheck | **Skipped** | No `typecheck` script in root or `web/package.json` |
| Lint | **Skipped** | No eslint script configured |
| `npm run build:web` | **Passed** | `evidence/build-web.log` |
| `npm test` (platform, adapters, reports, comparison, workflows, workspace) | **Passed** | `evidence/test-suite.log` |
| `npm run verify:workflows-regression` | **Passed** | `evidence/verify-workflows-regression.log` |
| `npm run verify:repair-e2e` | **Failed** | `evidence/verify-repair-e2e.log` |
| `verify:zap` | **Not run** | Optional; not in default `npm test` |

---

## 3. Affected workflows

**Changed capabilities (uncommitted + `5831549`):**

- URL QA: iframe-aware readiness, Playwright preflight, axe/Lighthouse on embedded content, scan defaults (Landing / RunTest).
- Reporting: repair plan sections, headlines, runner-failure repair prompts, `/api/health` playwright field.
- L3 + repair workspace (committed in `5831549`): gap recipes, apply/verify pipeline.

**Focused checks run:**

| Workflow | Result | Notes |
| --- | --- | --- |
| Landing UI load | **Pass** | Browser snapshot — heading, URL field, “Run health scan” |
| Run scan → report → repair apply/verify | **Not retested** in this checkup | Requires long Playwright URL run + AI optional |
| `verify:repair-e2e` | **Fail** | Baseline persist step + `verification_failed` after apply |
| `verify:workflows-regression` | **Pass** | — |

**Expansion:** Ran `verify:repair-e2e` and `verify:workflows-regression` beyond `npm test` because repair workspace and fixture changes are high-risk shared paths.

---

## 4. Small cleanup review

| ID | Kind | Finding |
| --- | --- | --- |
| TEST-002 | **Defect (confirmed)** | Unstaged `fixtures/workflow-app/create.html` makes `broken-persist` **write** `localStorage` — contradicts gap test design; aligns with repair E2E failure. |
| SUG-001 | Suggestion | `waitForEmbeddedFrames` + `waitForAppReadiness` duplicated in axe adapter and level4-quality. |
| — | Suggestion | `package.json` `postinstall` runs `playwright install chromium` — confirm acceptable for all install contexts (CI/Docker). |

No unrelated cleanup performed.

---

## 5. Regression comparison

**Previous build-checkup report in this repo:** **None** — all findings labeled **NEW**. No prior `BUILD_CHECKUP_REPORT.md` to diff.

| Label | Items |
| --- | --- |
| **NEW** | DEL-001, DEL-002, TEST-001, TEST-002, OPS-001, SUG-001 |
| **STILL OPEN** | — |
| **FIXED** | — |
| **RETURNED** | — |
| **NOT RETESTED** | Full UI scan submit, deploy verification, ZAP verify |

---

## Findings (by severity)

### High

1. **DEL-001 — Diverged from `origin/main`** — Integrate 7 remote commits (incl. code-health PR #10) with local `5831549` before push.
2. **TEST-001 — `verify:repair-e2e` failed** — See log; repair verify did not reach `verified_fixed`.

### Medium

3. **DEL-002 — Uncommitted delta** — ~552 insertions across engine/UI/server since `5831549`; not on remote.

### Low / info

4. **TEST-002 — Fixture WIP** — Revert or commit with test updates (`create.html`).
5. **OPS-001 — Stale dev server** — Restart after `server/index.mjs` changes for accurate `/api/health`.
6. **SUG-001 — Duplicated wait logic** — Optional refactor.

---

## Next three actions

1. **Rebase or merge `origin/main`** (`81434e3`) onto local `main`, resolve conflicts, re-run `npm test`.
2. **Revert** the unstaged `broken-persist` `localStorage` lines in `fixtures/workflow-app/create.html` (or finish the intentional fixture change with updated E2E expectations).
3. **`npm run verify:repair-e2e`** until green, then **commit** in logical chunks and open a PR; confirm CI on the **pushed** SHA.

---

## Artifacts

- Checkpoint: `audit/build-checkup-20261016/CHECKPOINT.md`
- Findings machine-readable: `audit/build-checkup-20261016/BUILD_CHECKUP_FINDINGS.json`
- Logs: `audit/build-checkup-20261016/evidence/*.log`, `health.json`

**Git after report:** new files under `audit/build-checkup-20261016/` only. Checkpoint **not** advanced. No commits, push, merge, deploy, or discard.
