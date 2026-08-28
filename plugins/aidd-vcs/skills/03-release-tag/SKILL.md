---
name: 03-release-tag
description: Cut a semver release with an annotated tag and release notes. Use when the user wants to release, tag a release, bump the version, or cut a version. Not for a plain commit, a pull request, or amending an existing tag.
argument-hint: version
---

# Release Tag

Cuts annotated semver releases with notes derived from recent commits.

## Actions

| #   | Action         | Role                                                                       | Input                              |
| --- | -------------- | -------------------------------------------------------------------------- | ---------------------------------- |
| 01  | `release-tag`  | Compute version, draft notes, validate, bump, tag, push                    | version (optional), notes_overrides|

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Versions follow semver `major.minor.patch` strictly. No suffixes unless explicitly requested.
- Tags are annotated (`git tag -a`), never lightweight.
- Release notes are mandatory and follow `assets/release-template.md`.
- Always ask the user to validate the version, notes, and impacted files before tagging.
- Never `--force` push tags. Use `--force-with-lease` only when explicitly required.
- The bump commit only includes version-manager files (e.g. `package.json`, `pyproject.toml`).

## Assets

- `assets/release-template.md`: Release notes template.
