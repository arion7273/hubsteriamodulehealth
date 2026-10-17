# Build Checkup — saved starting point

## Checkpoint resolution

**No saved checkpoint exists** in this repository. There is no prior `audit/build-checkup-*/CHECKPOINT.md`, `docs/checkpoints/build-checkup-*.md`, or `BUILD_CHECKUP_CHECKPOINT.json`.

This report **does not** adopt a different baseline silently.

## Proposed replacement range (choose one when advancing checkpoint)

| Option | Baseline SHA | Through | Use when |
| --- | --- | --- | --- |
| **A (recommended)** | `1fab6c371b4764d04e24b165948138c7afea41fd` | `5831549` + current working tree | Track **all** local delivery since last shared commit with `origin/main` (1 local commit + uncommitted work). |
| **B** | `5831549e9cf77262e512ebd27a590c65807314b3` | Working tree only | Track **only** uncommitted changes after the L3/repair workspace commit. |

**Merge-base with `origin/main` (after fetch):** `1fab6c3` — ancestor of local `HEAD` ✓  
**`origin/main` @ fetch:** `81434e35e863c2feb2743737f1fb6817cdf84e00` — **not** an ancestor of local `HEAD` (diverged: 7 commits on remote, 1 local-only commit).

## Adopted for this report (Option A)

| Field | Value |
| --- | --- |
| Baseline SHA | `1fab6c371b4764d04e24b165948138c7afea41fd` |
| HEAD SHA (committed) | `5831549e9cf77262e512ebd27a590c65807314b3` |
| Commits `baseline..HEAD` | **1** |
| Tested tree | **Dirty** — `5831549` + unstaged + untracked source (see report) |
| Ancestor check | Baseline **is** ancestor of HEAD ✓ |

**Do not** advance this file automatically; update manually when starting the next build checkup.
