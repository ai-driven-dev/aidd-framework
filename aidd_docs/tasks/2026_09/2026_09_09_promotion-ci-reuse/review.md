# Review: Reuse validated next CI during promotion

- **Verdict**: approve
- **Diff**: `origin/next...HEAD`
- **Axes run**: code, functional, relevancy
- **Date**: 2026_09_09
- **Findings**: 0 critical, 0 warning, 0 minor

## Phases

### Phase 1 — Reuse a validated promotion snapshot

- [x] Only a `promote/next-to-main-<run-id>` PR whose exact head SHA already has a successful `push` `cli / gate` on `next` may set mutation scopes to empty. — `.github/workflows/cli-ci.yml:103-127`
- [x] Missing, failed, or unreadable validation proof does not skip mutations. — `.github/workflows/cli-ci.yml:100-127`
- [x] A trusted promotion still runs coverage, smoke, build, platform, and other non-mutation checks against GitHub's PR merge ref. — `.github/workflows/cli-ci.yml:143-476`
- [x] Ordinary pull requests retain their existing job and mutation behavior. — `.github/workflows/cli-ci.yml:133-151`

### Phase 2 — Lock the workflow contract

- [x] The contract test fails if trusted promotion detection, mutation fallback, retained checks, or gate fan-in is removed. — `scripts/__tests__/cli-ci-gate-covers-every-job.test.js:15-26,63-107`
- [x] Deployment memory accurately states when promotion skips mutations and what still runs. — `aidd_docs/memory/deployment.md:12`

## Findings

| Sev | Kind | Phase | Location | Issue | Fix |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | None. | — |

## Verification

| Metric | Value |
| --- | --- |
| Verified | 100% (6/6) |
| Files checked | `.github/workflows/cli-ci.yml`, `scripts/__tests__/cli-ci-gate-covers-every-job.test.js`, `aidd_docs/memory/deployment.md`, `.github/workflows/promote.yml`, `.github/rulesets/main.json`, `.github/rulesets/next.json` |
| Unchecked | none |
| Unplanned | none |
