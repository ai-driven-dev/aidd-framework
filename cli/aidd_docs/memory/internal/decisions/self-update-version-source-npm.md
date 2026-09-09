# self-update reads the latest version from the public npm registry, not GitHub releases

- Date: 2026-07-17
- Status: Accepted

## Context

`aidd self-update` resolved the latest version from the GitHub repo `ai-driven-dev/aidd-cli` via `/releases/latest`. That repo is currently private. A user without a GitHub token sends an unauthenticated request, and GitHub masks private repos as HTTP 404. Every tokenless user therefore saw `Resource not found (HTTP 404): .../releases/latest` and could not self-update. The CLI itself ships publicly on npm as `@ai-driven-dev/cli`.

## Decision

Resolve the latest version from the public npm registry dist-tags endpoint (`registry.npmjs.org/-/package/@ai-driven-dev/cli/dist-tags`) — the same source `npm install -g @ai-driven-dev/cli@latest` pulls from. The GitHub release body is fetched best-effort for the changelog only; its 404 is swallowed, yielding an empty changelog rather than a failure.

## Alternatives

- **Make the repo public.** Zero code, keeps the changelog, but it is an infra/product decision on a separate timeline (repo is "private for now, public soon") and would leave self-update fragile against any future re-privatization.
- **Require a GitHub token for self-update.** Forces every user of a public npm package to hold a GitHub token — wrong ergonomics, and hits the 60/hr unauthenticated rate limit.

## Consequences

- Version resolution works for every user regardless of GitHub repo visibility or token, and stays correct after the repo goes public.
- The registry is hardcoded to `registry.npmjs.org`; a user with a custom npm mirror is checked against npmjs.org even though their `pnpm/yarn/bun add -g` may pull from the mirror. Same content for a public package, but a corporate-mirror audience would need this revisited.
- The changelog is now optional: tokenless users get an empty changelog until the repo is public.
- Override hooks for tests: `AIDD_SELF_UPDATE_NPM_BASE` (npm base) and `AIDD_SELF_UPDATE_API_BASE` (GitHub base), wired in `runtime/wiring/framework.ts`.
- See PR #316, issue #315.
