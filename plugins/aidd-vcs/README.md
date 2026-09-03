← [aidd-framework](../../README.md)

# aidd-vcs

VCS workflow plugin for the AI-Driven Development framework.

> Status: stable.

First time? Install with `/plugin install aidd-vcs@aidd-framework`, then run `aidd-vcs:01-commit`.

Typical flow: `00-repo-init` once to set up the repo; `01-commit` after each unit of work; `02-pull-request` when the branch is ready; `03-release-tag` at release time; `04-issue-create` from anywhere.

Covers all external artifact creation: repo init, commits, pull/merge requests, release tags, and issue tracking.

## Skills

| Bracket ID | Skill | Description |
|---|---|---|
| [3.0] | [repo-init](skills/00-repo-init/SKILL.md) | Initialize a repo: git init, default branch, bootstrap commit, CONTRIBUTING.md, optional remote. |
| [3.1] | [commit](skills/01-commit/SKILL.md) | Commit atomically; safely retry scoped hook fixes. |
| [3.2] | [pull-request](skills/02-pull-request/SKILL.md) | Create PR (GitHub) or MR (GitLab) with filled template. |
| [3.3] | [release-tag](skills/03-release-tag/SKILL.md) | Create and push a semantic version git tag with release notes. |
| [3.4] | [issue-create](skills/04-issue-create/SKILL.md) | Create issues in the configured ticketing tool. |

## Assets

Each skill ships with VCS-specific templates in its `assets/` directory.
