---
name: 00-repo-init
description: Initialize a project repository with git init, a default branch, a bootstrap commit, CONTRIBUTING.md, and optionally the remote. Use when the user wants to init or set up a new repo, or publish to a remote. Not for committing, opening a PR, or tagging.
argument-hint: directory | remote
---

# Repo Init

> Status: experimental.

Initializes a project's repository locally and, on request, on the remote host, then returns the remote URL.

## Actions

| #   | Action    | Role                                                                                              | Input                           |
| --- | --------- | ------------------------------------------------------------------------------------------------- | ------------------------------- |
| 01  | `init`    | Resolve VCS config, `git init`, set the default branch, write `CONTRIBUTING.md`, bootstrap commit | cwd, default_branch, remote_url |
| 02  | `publish` | Create the remote repo on the resolved host and push, return its URL                              | cwd, non_interactive            |

Run `01 → 02`. `init` alone for local-only; `publish` after it to create the remote.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- The local step is idempotent. If the target is already a git work tree, `init` does nothing and reports.
- `init` makes one bootstrap commit (`--allow-empty`) so `HEAD` exists and is pushable. The project's real first commit stays the commit skill's job.
- `publish` is outward-facing. It confirms before creating the remote unless `non_interactive` is set.
- The provider is open. Resolve the host and how to reach it (CLI, MCP, or API) from the VCS memory when present, else from the VCS tooling available in the environment. Never restrict to a fixed list or a fixed mechanism. `main` is the default-branch fallback.

## Prerequisites

- `git` on the PATH. For `publish`, the resolved host's tooling (CLI, MCP, or API) available and authenticated.

## Assets

- `assets/CONTRIBUTING.md`: the project-root `CONTRIBUTING.md` template.
