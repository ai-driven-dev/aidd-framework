---
objective: "Two vitest runs at once can no longer disturb each other, because no test reads a binary another run can rewrite."
status: implemented
---

# Plan: Give each e2e run its own binary

## Overview

| Field | Value |
| ----- | ----- |
| **Goal** | Remove the sharing that makes concurrent runs report false golden failures, instead of serialising the runs |
| **Source** | `aidd_docs/memory/testing.md` § "Run one vitest at a time" — the failure seen twice during the context refactor, both times chased as a phantom |

## The measured cause

`tests/e2e/helpers.ts:27` resolves `CLI_PATH` to `process.cwd()/dist/cli.js`, and two more
e2e files repeat the same line. `pnpm test` is `pnpm build && vitest run`, and `tsup` runs
with `clean: true`. So a second run deletes and rewrites the binary the first run is
reading, mid-suite. The golden suites capture the same command twice and compare bytes,
which is exactly the assertion a rewrite between the two captures breaks.

The workaround in memory is a rule for humans: run one at a time. A rule nobody can
enforce is not a guarantee.

## Phases

| # | Phase | File |
| - | ----- | ---- |
| 1 | Build the e2e binary into a directory only that run knows | [`phase-1.md`](./phase-1.md) |

## Decisions

| Decision | Why |
| -------- | --- |
| Build per run rather than lock the shared one | A lock serialises the runs and keeps the coupling; a private directory removes it. The build costs 66 ms, measured, so there is nothing to save by sharing |
| No fallback to `dist/cli.js` when the variable is absent | A fallback restores the shared path silently, which is the bug. Absent means the setup did not run, and that must say so |
| `pnpm test` stops building | Nothing in the test run reads `dist/` any more. Leaving the build in would keep a second pair of concurrent writers on the same directory for no reader |
| A test forbids the path from coming back | Every other boundary in this repo is held by a test rather than a convention; this one should be too |
