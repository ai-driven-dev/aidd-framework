# aidd-vcs catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-vcs` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/00-repo-init`](#skills00-repo-init)
  - [`skills/01-commit`](#skills01-commit)
  - [`skills/02-pull-request`](#skills02-pull-request)
  - [`skills/03-release-tag`](#skills03-release-tag)
  - [`skills/04-issue-create`](#skills04-issue-create)
  - [`skills/05-resolve-conflict`](#skills05-resolve-conflict)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `skills`

#### `skills/00-repo-init`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-init.md](skills/00-repo-init/actions/01-init.md) | - |
| `actions` | [02-publish.md](skills/00-repo-init/actions/02-publish.md) | - |
| `assets` | [CONTRIBUTING.md](skills/00-repo-init/assets/CONTRIBUTING.md) | - |
| `-` | [SKILL.md](skills/00-repo-init/SKILL.md) | `Initialize a project repository with git init, a default branch, a bootstrap commit, CONTRIBUTING.md, and optionally the remote. Use when the user wants to init or set up a new repo, or publish to a remote. Not for committing, opening a PR, or tagging.` |

#### `skills/01-commit`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-collect.md](skills/01-commit/actions/01-collect.md) | - |
| `actions` | [02-message.md](skills/01-commit/actions/02-message.md) | - |
| `actions` | [03-commit.md](skills/01-commit/actions/03-commit.md) | - |
| `assets` | [commit-template.md](skills/01-commit/assets/commit-template.md) | `VCS commit message template` |
| `-` | [SKILL.md](skills/01-commit/SKILL.md) | `Create an atomic git commit with a conventional message, optionally pushing. Use when the user wants to commit changes, optionally pushing the branch. Not for amending, rebasing, opening a pull request, or tagging a release.` |

#### `skills/02-pull-request`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-collect.md](skills/02-pull-request/actions/01-collect.md) | - |
| `actions` | [02-draft.md](skills/02-pull-request/actions/02-draft.md) | - |
| `actions` | [03-create.md](skills/02-pull-request/actions/03-create.md) | - |
| `assets` | [branch.md](skills/02-pull-request/assets/branch.md) | `VCS branch naming convention template` |
| `assets` | [pull_request.md](skills/02-pull-request/assets/pull_request.md) | `VCS pull/merge request template` |
| `-` | [SKILL.md](skills/02-pull-request/SKILL.md) | `Create a draft pull or merge request from the current branch, in whatever VCS tool the project uses. Use when the user wants to open a pull or merge request. Not for committing, pushing, or merging a branch.` |

#### `skills/03-release-tag`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-release-tag.md](skills/03-release-tag/actions/01-release-tag.md) | - |
| `assets` | [release-template.md](skills/03-release-tag/assets/release-template.md) | `VCS release notes template` |
| `-` | [SKILL.md](skills/03-release-tag/SKILL.md) | `Cut a semver release with an annotated tag and release notes. Use when the user wants to release, tag a release, bump the version, or cut a version. Not for a plain commit, a pull request, or amending an existing tag.` |

#### `skills/04-issue-create`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-issue-create.md](skills/04-issue-create/actions/01-issue-create.md) | - |
| `assets` | [CONTRIBUTING.md](skills/04-issue-create/assets/CONTRIBUTING.md) | `Project contribution guidelines template` |
| `assets` | [issue-template.md](skills/04-issue-create/assets/issue-template.md) | `VCS issue/ticket template` |
| `-` | [SKILL.md](skills/04-issue-create/SKILL.md) | `Create an issue in the configured ticketing tool. Use when the user wants to file a bug, open an issue, or report a problem. Not for committing, opening a pull request, or commenting on an existing issue.` |

#### `skills/05-resolve-conflict`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-resolve.md](skills/05-resolve-conflict/actions/01-resolve.md) | - |
| `assets` | [resolution-table.md](skills/05-resolve-conflict/assets/resolution-table.md) | - |
| `-` | [SKILL.md](skills/05-resolve-conflict/SKILL.md) | `Resolves deterministic Git conflicts or approved choices. Use when the user wants to resolve a merge, rebase, or cherry-pick conflict. Not for deciding between competing implementations or committing changes.` |

