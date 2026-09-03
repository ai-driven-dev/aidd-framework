---
name: 00-async-dev
description: Drive the async-dev pipeline from one entry point, whether setup, run, or review. Use when the user wants to install async dev, run a ready issue, or address PR review comments, or on a webhook trigger. Not for plain status checks.
argument-hint: setup | run | review
---

# Async-dev

Single skill that drives the async development pipeline end to end. Three sub-flows live inside, accessed through one router:

| Sub-flow | When                                                                                          |
| -------- | --------------------------------------------------------------------------------------------- |
| Setup    | Repo not yet configured for async dev; user wants to install.                                 |
| Run      | An issue is labeled `to-implement` (or commented `@claude /implement`); no open PR closes it. |
| Review   | A PR is labeled `to-review` (or commented `@claude /review`); change requests pending.        |

## Iron rule

**You are the router until you commit to a sub-flow. Once committed, run that sub-flow's actions in order; do not jump back to routing mid-flow.**

## Routing: hybrid contract

Walk in order. First match wins.

1. **Argument override.** If the arguments contain exactly `setup`, `run`, or `review` (case-insensitive, standalone token), route there immediately. This is the explicit override the CI workflow uses.
2. **Trigger env.** When invoked from CI (`GITHUB_EVENT_NAME` set):
   - Label payload `to-implement` → `run`.
   - Label payload `to-review` → `review`.
   - Comment body matches `@claude /implement` (or `/aidd-dev:02-implement`) → `run`.
   - Comment body matches `@claude /review` → `review`.
3. **Repo state.**
   - Missing `.github/workflows/aidd-async.yml` AND missing `.claude/aidd-orchestrator.json` → `setup`.
   - Open PR closes the referenced issue → `review`.
   - Fresh issue with no linked PR + intent to implement → `run`.
4. **Natural-language intent.** Verbs in the user prompt:
   - `install / configure / set up / bootstrap / rotate config` → `setup`.
   - `implement / run / process / handle queue / claude on issue` → `run`.
   - `address review / iterate on PR / fix comments / handle review` → `review`.

**Tie-break:** most-specific signal wins (PR number > label > free-text keyword > config absence).

**If none of the above resolves**, surface the three sub-flows with one-line triggers and ask the human which to run. **Never proceed blindly.**

**If repo state contradicts intent** (e.g. user says "run" but `.claude/aidd-orchestrator.json` is absent), surface the conflict before delegating; never silently switch.

See `references/routing.md` for the full decision tree, signal precedence, and edge cases.

## Sub-flows

### Setup (11 actions)

Sets up async-dev in a repo. Detects context, asks for runtime parameters, generates artefacts, bootstraps labels, installs user-scope plugins (local mode), configures secrets (remote mode), schedules the poll routine (local mode), commits and pushes the generated files, and offers a smoke test on the chosen issue.

| #   | Action                            | Role                                                                                          |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| 01  | `detect-context`                  | Identify repo, default branch, existing config, CI permissions                                |
| 02  | `ask-config`                      | Collect runtime parameters (mode, auth, labels, schedule, agents)                             |
| 03  | `generate-workflow`               | Emit `.github/workflows/aidd-async.yml` from `assets/setup/workflow-template.yml`             |
| 04  | `generate-local-script`           | Emit poll/daemon scripts (local mode only) from `assets/setup/local-*-template.sh`            |
| 05  | `write-config`                    | Persist `.claude/aidd-orchestrator.json` from `assets/setup/config-template.json`             |
| 06  | `bootstrap-labels`                | Create `to-implement` / `to-review` / `claude/*` labels via `gh`                              |
| 07  | `install-user-scope-plugins`      | Install `aidd-orchestrator` + `aidd-dev` at user scope (local mode)                           |
| 08  | `configure-remote-secrets`        | Sync `CLAUDE_CODE_OAUTH_TOKEN`, `AIDD_BOT_TOKEN`, etc. (remote mode)                          |
| 09  | `bootstrap-scheduling`            | Schedule the poll routine (local) or rely on workflow webhook (remote)                        |
| 10  | `commit-and-push`                 | Stage generated files, conventional-commit, push                                              |
| 11  | `smoke-test`                      | Label a throwaway issue with `to-implement`; verify the pipeline reacts                       |

Files: `actions/setup/01-detect-context.md` ... `actions/setup/11-smoke-test.md`.

Default flow: `01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 10 → 11`. Actions self-skip when their preconditions are not met (e.g. `07` skips in remote mode, `08` skips in local mode).

### Run (6 actions)

Executes one orchestration cycle on a fresh issue. Reads ready issues, resolves blockers, acquires the lock label, hands the implementation to the active SDLC orchestration capability, observes the resulting git and VCS state, and emits a `run-result.json` summary the workflow's post-job consumes.

| #   | Action            | Role                                                                                           |
| --- | ----------------- | ---------------------------------------------------------------------------------------------- |
| 01  | `poll-ready`      | Find the next issue with `to-implement`, no `claude/working`, no open closing PR               |
| 02  | `resolve-deps`    | Check linked issues / dependencies; abort if blocked                                           |
| 03  | `acquire-lock`    | Apply `claude/working` label; refuse if already held                                           |
| 04  | `check-sdlc`      | Verify an SDLC orchestration capability is loaded                                              |
| 05  | `delegate-sdlc`   | Hand the issue to the SDLC capability; observe outcome                                         |
| 06  | `write-audit`     | Emit `run-result.json` for the workflow's post-job                                             |

Files: `actions/run/01-poll-ready.md` ... `actions/run/06-write-audit.md`.

Default flow: `01 → 02 → 03 → 04 → 05 → 06`. One cycle per ready issue.

### Review (4 actions)

Closes the loop after a PR is opened by the run flow. Detects when to keep auto-fixing and when to hand off to a human. Idempotent on re-runs.

| #   | Action               | Role                                                                                       |
| --- | -------------------- | ------------------------------------------------------------------------------------------ |
| 01  | `collect-comments`   | Read all PR + linked-issue comments newer than the last bot activity                       |
| 02  | `detect-stop`        | Decide stop vs continue using `references/review/stop-conditions.md`                       |
| 03  | `fix-iteration`      | Delegate fixes to the SDLC capability; reply to each addressed comment                     |
| 04  | `finalize`           | Resolve threads, post the structured summary, set `claude/awaiting-review` or `blocked`    |

Files: `actions/review/01-collect-comments.md` ... `actions/review/04-finalize.md`.

Default flow: `01 → 02 → (03 → 01 loop if continue) → 04`. Stop conditions in `references/review/stop-conditions.md`.

## Rules

- Exactly one sub-flow runs per invocation. The router commits, then runs that sub-flow to completion.
- Never inline a sub-flow's logic at the router level. The router decides; the actions execute.
- Each action enforces its own pre-flight checks and exit codes. The router never enforces post-conditions.
- If a sub-flow aborts, surface the exit state; do not retry by switching sub-flows.
- For batch invocations (e.g. multiple ready issues), the workflow re-invokes the skill once per item; the router does not loop.

## References

- `references/routing.md` - full decision tree, signal precedence, conflict resolution.
- `references/setup/auth-modes.md` - local vs remote auth contracts.
- `references/setup/claude-action-auth.md` - `claude-code-action` token setup.
- `references/setup/local-mode-scheduling.md` - poll routine options.
- `references/review/stop-conditions.md` - when the review loop hands off to a human.

## Assets

Setup-only templates copied into the target repo by the setup sub-flow:

- `assets/setup/workflow-template.yml` - `.github/workflows/aidd-async.yml` skeleton.
- `assets/setup/local-poll-template.sh` - local-mode poll script.
- `assets/setup/local-daemon-template.sh` - local-mode daemon script.
- `assets/setup/config-template.json` - `.claude/aidd-orchestrator.json` skeleton.

## Test

Each sub-flow's final action carries a `## Test` block that exercises the full sub-flow with mocked dependencies.
