---
name: 01-commit
description: Create an atomic git commit with a conventional message, optionally pushing. Use when the user wants to commit changes, optionally pushing the branch. Not for amending, rebasing, opening a pull request, or tagging a release.
argument-hint: paths | auto | push
---

# Commit

Stage the right changes, write the message, commit. `01 → 02 → 03`.

## Actions

| #   | Action    | Step                                                  |
| --- | --------- | ----------------------------------------------------- |
| 01  | `collect` | Review the change and stage what belongs in one commit |
| 02  | `message` | Write the conventional message                         |
| 03  | `commit`  | Commit, and push when asked                            |

Several concerns means several commits: repeat the chain, one concern at a time.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Follow the project's convention in `aidd_docs/memory/vcs.md` when set, else `assets/commit-template.md`.
- One concern per commit. Imperative mood. The body says why, not what.
- Reference the issue in the body when there is one.
- Never `--force` push; `--force-with-lease` only when explicitly asked.
- A hook that rejects the commit is not this skill's job: report which hook and why, then stop. Re-stage only files a hook auto-formatted.
- `auto` never prompts. `interactive` confirms before staging and before each split.
- Commits locally by default; pushes as well only when the push option is set.

## Assets

- `assets/commit-template.md`: Conventional commit format reference.
