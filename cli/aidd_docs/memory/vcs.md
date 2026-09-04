# VCS

What version control means for this package. The repository's own conventions — branches, targets, the release model — are in the repo bank's `vcs.md`; this page holds only what differs here.

## Setup

- Same platform, same branches, same routing as the repository. Read that page first.

## Branches

- Nothing package-specific. A `cli/` change follows the repository's prefixes.

## Commits

- `cli` is this package's only scope in `commitlint.config.cjs`. `domain`, `infra` and `install` are not in the enum and warn.
- A `feat` or `fix` under `cli/` releases `@ai-driven-dev/cli` alone, under its own `cli-v<semver>` tag.
- A commit made by an AI session carries an `AIDD-Session-Id` trailer, appended by a `prepare-commit-msg` line that `aidd telemetry on` installs and `telemetry off` removes. It is what lets a session's cost be read per commit.
- The enforced header limit is 100, whatever a page says. Read `commitlint.config.cjs`; it wins.

## Commit Strategy

AI should auto commit: `never`.
