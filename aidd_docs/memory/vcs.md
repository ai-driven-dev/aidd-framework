# VCS

The version-control conventions this project follows: branches, commits, and the platform.

> CLI-specific notes: [`cli/aidd_docs/memory/vcs.md`](../../cli/aidd_docs/memory/vcs.md).

## Setup

- Production branch: `main`. Integration branch: `next`, the target for day-to-day work.
- GitHub's default branch is `main`, so `gh pr create` without `--base next` targets production.
- Platform: GitHub, driven through `gh`. Tickets are GitHub Issues.
- Pull request template: `.github/PULL_REQUEST_TEMPLATE.md`.
- The release model — weekly promotion, hotfix path — is in [`RELEASE.md`](../../RELEASE.md); the tooling behind it is in `deployment.md`.

## Branches

- Format: `type/short-description`.
- The **prefix alone decides the PR target**, not an issue type and not a board field. `aidd-vcs:02-pull-request` reads this table to set the base automatically.

| I want to… | Issue template | Branch | Commit | Issue type | PR targets |
| ---------- | -------------- | ------ | ------ | ---------- | ---------- |
| ship a feature | 🌱 Quick Contribution | `feat/…` | `feat:` | `Feature` | `next` |
| fix a bug | 🐛 Bug Report | `fix/…` | `fix:` | `Bug` | `next` |
| change docs only | 📋 Detailed Contribution | `docs/…` | `docs:` | `Task` | `next` |
| refactor (no behaviour change) | 📋 Detailed Contribution | `refactor/…` | `refactor:` | `Task` | `next` |
| build / config / deps | 📋 Detailed Contribution | `chore/…` | `chore:` | `Task` | `next` |
| add or update tests | 📋 Detailed Contribution | `test/…` | `test:` | `Task` | `next` |
| 🚨 urgent production fix | 🐛 Bug Report | `hotfix/…` | `fix:` | `Bug` | **`main`** |

- Everything batches on `next` and ships in the weekly release. **Only `hotfix/*` targets `main`.**
- The issue type categorizes, it never routes, and the form stamps it — never set it by hand. Labels exist only where a bot or a human reads one (`.github/labels.yml`).
- The board does not advance on its own; it is moved by hand, by a human or an agent through `gh`. Board conventions are in `backlog.md`.
- Automation owns `promote/*` and `back-merge/*`, which follow neither the format nor the table.

## Commits

- Convention: [Conventional Commits](https://www.conventionalcommits.org/), enforced by `commitlint.config.cjs`. **Read that file before composing a message; if this page and the config disagree, the config wins.**
- Format: `type(scope): description`, description in the imperative, lowercase, no trailing period. The enforced header limit is 100.
- Scope is optional and must be kebab-case. The encouraged list lives in `scope-enum` at warning level, so an unknown scope warns without blocking. Introduce a new one only when none fits.
- The scope never routes a release: release-please attributes by changed path.
- A breaking change goes in the footer as `BREAKING CHANGE: …`.

## Commit Strategy

AI should auto commit: `never`. Committing and pushing happen only when the user asks.
