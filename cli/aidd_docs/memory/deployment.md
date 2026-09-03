# Deployment

## Environment Variables

- `AIDD_TOKEN` — GitHub token used to fetch private marketplaces / plugin sources (see `auth.md`). Not a registry credential.

## Build & Publish

- Build: `pnpm build` → `dist/cli.js` (tsup, ESM bundle); runs `scripts/check-bundle-size.mjs` automatically.
- Bundle budget: 500 KB (`bundleBudgetKB` in `package.json`); build fails if exceeded.
- Local install test: `pnpm run install:local` (packs, then `npm install -g` the tarball with `--force`).
- Runtime requirements: Node.js >= 22.12, pnpm >= 9.
- **Release is automated, not manual.** `release-please` maintains a single open release PR off `main`; merging it bumps the version, writes the CHANGELOG, and tags `vX.Y.Z`.
- The tag fires the **Publish** job (`.github/workflows/ci.yml`), which publishes to **both** registries:
  - GitHub Packages — `pnpm publish --no-git-checks`
  - public npm — `registry.npmjs.org`, `pnpm publish --access public`, via OIDC trusted publishing (`id-token: write` + `NPM_TOKEN`).

## Self-update

- `aidd self-update` reads the latest version from the **public npm registry** dist-tags (`registry.npmjs.org/-/package/@ai-driven-dev/cli/dist-tags`), not GitHub releases — see `internal/decisions/self-update-version-source-npm.md`. Changelog is best-effort from GitHub.
- npm registry reads must send `Accept: application/json`. The shared HTTP client defaults `Accept` to `application/vnd.github+json`; npm answers that with **HTTP 406**.

## Tooling facts

- **Biome** is the sole linter + formatter — no ESLint, no Prettier. Config at repo root (`biome.json`). Fix with `biome check --write`.
- **Lefthook** runs git hooks; **commitlint** enforces Conventional Commits.

## Git Hooks (`lefthook.yml`)

Hooks run this repo's own checks directly (no parent-monorepo delegation):

- `pre-commit`: `pnpm lint` (biome) + `pnpm typecheck`
- `pre-push`: `pnpm knip` + `pnpm test`
- `commit-msg`: `commitlint --edit`

## CI/CD

- `.github/workflows/ci.yml` — "CI & Publish", on push to `main`: commitlint → (typecheck, lint, test, build & bundle budget, knip, jscpd) → release-please → publish.
- No containerization, no monitoring infrastructure.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm build` | tsup production build + bundle size check |
| `pnpm test` | build + vitest run (all tests) |
| `pnpm typecheck` | tsc --noEmit |
| `pnpm lint` | biome check |
| `pnpm format` | biome format --write |
| `pnpm smoke` | build + `scripts/smoke-tools.sh` (full-matrix smoke on the real binary) |
| `pnpm pack:local` | build + pack to dist/ |
| `pnpm install:local` | pack + npm install -g (`--force`) |
| `pnpm build:check-size` | run bundle size check only (no rebuild) |
| `pnpm test:mutation` | Stryker mutation testing (slow; CI gate) |
