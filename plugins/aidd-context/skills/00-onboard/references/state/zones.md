# State zones

Disk/VCS checks that place the project. Each check is met, drift (present, off canonical shape), or missing.

## Foundations

State-aware order: existing repo (code) => memory first, stack skipped. Greenfield => stack → memory → wire.

| Check          | Met when                                                       | Drift when               | Deliverable                | Command                          |
| -------------- | ------------------------------------------------------------- | ------------------------ | -------------------------- | -------------------------------- |
| tech stack     | `INSTALL.md` exists OR repo established (code or synced memory) | —                        | tech stack                 | `aidd-context:01-bootstrap`      |
| project memory | `aidd_docs/memory/` has real content                          | files empty/placeholder  | project knowledge saved    | `aidd-context:02-project-memory` |
| memory wiring  | the standard project memory block in each used tool's context file | block present, off shape | knowledge loaded by the AI | `aidd-context:02-project-memory` |

- tech stack missing only on greenfield (no code AND no synced memory).
- memory wiring: no block or no context file = missing. Drift = a block present but not the standard one that imports the memory files.

## Dev flow

Cumulative: a downstream artifact implies the upstream stages met. The pin sits on the furthest reached.

| Stage     | Detected when                                 |
| --------- | --------------------------------------------- |
| spec      | a spec under `aidd_docs/`, nothing downstream |
| plan      | `plan.md`, no code against it                 |
| implement | code against the plan                         |
| review    | code done, current branch PR awaits review    |
| PR        | current branch has an open PR                 |

- `review` and `PR` read VCS **current branch only** — ignore repo-wide PRs and review queues (another branch is another dev).
- `brainstorm`, `assert`, and `commit` have no cheap signal. The plan `status:` hedge and cumulative state place the pin (see `hedge.md`).

## Health

Beside-the-flow tools, surfaced only when their signal fires. Scan project source only, not templates, fixtures, examples, generated output, or installed-plugin trees.

| Signal      | Fires when                                  | Command             |
| ----------- | ------------------------------------------- | ------------------- |
| no tests    | no real test files                          | `aidd-dev:06-test`  |
| bug markers | `TODO`/`FIXME` or reported errors in source | `aidd-dev:08-debug` |
| messy code  | a file far longer/deeper than siblings      | `aidd-dev:04-audit` |
