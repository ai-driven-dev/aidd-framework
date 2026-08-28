---
name: 02-pull-request
description: Create a draft pull or merge request from the current branch, in whatever VCS tool the project uses. Use when the user wants to open a pull or merge request. Not for committing, pushing, or merging a branch.
argument-hint: base | title
---

# Pull Request

Collect the change, draft the request, create it as a draft. `01 → 02 → 03`.

## Actions

| #   | Action    | Step                                                        |
| --- | --------- | ----------------------------------------------------------- |
| 01  | `collect` | Resolve the base and gather the commits since it             |
| 02  | `draft`   | Write the title and body from the template                   |
| 03  | `create`  | Open the draft request, label it, return the URL             |

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Follow the project's request practices in `aidd_docs/memory/vcs.md` and the repo's own request template when set, else the bundled `assets/pull_request.md`.
- Resolve the base from the branch's prefix per the project's convention (`vcs.md`), else the repo's default branch. Never assume `main`.
- The request is always a draft; the user promotes it.
- Apply only the triage label the branch prefix maps to, when it exists. Labels never change the base.
- Read the VCS tool from project memory, else infer it from the remote URL.
- Never commit, push, or branch here.

## Assets

- `assets/pull_request.md`: Request body template.
- `assets/branch.md`: Branch-naming convention, the fallback when project memory sets none.
