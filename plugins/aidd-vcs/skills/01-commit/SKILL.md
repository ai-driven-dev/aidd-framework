---
name: 01-commit
description: Create atomic conventional commits; safely retry scoped hook fixes; optionally push. Use when the user wants to commit changes, optionally pushing the branch. Not for amending, rebasing, opening a pull request, or tagging a release.
argument-hint: paths | auto | push
---

# Commit

Stage, message, commit. `01 → 02 → 03`.

## Actions

| #   | Action    | Step                                           |
| --- | --------- | ---------------------------------------------- |
| 01  | `collect` | Stage one concern                              |
| 02  | `message` | Write the conventional message                 |
| 03  | `commit`  | Commit, safely retry scoped fixes, push if asked |

Several concerns means several commits: repeat the chain, one concern at a time.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Follow the project's convention in `aidd_docs/memory/vcs.md` when set, else `assets/commit-template.md`.
- One concern per commit. Imperative mood. The body says why, not what.
- Reference the issue in the body when there is one.
- Never `--force` push; `--force-with-lease` only when explicitly asked.
- Retry a rejected hook only for deterministic changes within the current commit's files. Never broaden the change to make a check pass.
- `auto` never prompts. `interactive` confirms before staging and before each split.
- Commits locally by default; pushes as well only when the push option is set.

## Assets

- `assets/commit-template.md`: Conventional commit format reference.
