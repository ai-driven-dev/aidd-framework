# VCS

The version-control conventions this project follows: branches, commits, and the platform.

## Setup

- Production branch: `main`. Integration branch: `next`, the default target for day-to-day work.
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
- The board does not advance on its own: `Todo → In review → Done` is moved by hand, by a human or an agent through `gh`. Board conventions are in `backlog.md`.

## Commits

- Convention: [Conventional Commits](https://www.conventionalcommits.org/), enforced by `commitlint.config.cjs`. **Read that file before composing a message; if this page and the config disagree, the config wins.**
- Format: `type(scope): description`, description in the imperative, lowercase, no trailing period, 72 characters max.
- Scope is optional and must be kebab-case. The encouraged list lives in `scope-enum` at warning level, so an unknown scope warns without blocking. Introduce a new one only when none fits.
- `framework` and `marketplace` are the scopes that bump `marketplace.json` through release-please.
- A breaking change goes in the footer as `BREAKING CHANGE: …`.

## Commit Strategy

AI should auto commit: `never`. Committing and pushing happen only when the user asks.
