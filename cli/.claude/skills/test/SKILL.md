---
name: test
description: >
  Holds the two testing disciplines this package learned by paying for them, and points at the
  rest. Use when writing or changing a test under tests/, touching a golden snapshot, or fixing a
  user-reported bug. Do NOT use for tier conventions, the vitest projects, doubles, fixtures or
  how to run a suite — those live in `aidd_docs/memory/testing.md`. Do NOT use for writing
  production code — use the context skill that owns the concept (`tools`, `translate`,
  `distribution`, `framework`, `telemetry`).
---

# Test

The tiers, the four vitest projects, the doubles, the fixtures and the run commands are in
`aidd_docs/memory/testing.md`; read that first and do not restate it here. This skill exists for
the two failure modes that cost this package a shipped bug each, and that a convention page
states as a rule without saying how to satisfy it.

## Read before you touch one

- `references/golden-machine-independence.md` — a golden that snapshots a value derived from an
  absolute path passes locally and fails on another machine. The rule is in `testing.md`; this is
  the symptom, the root cause and the two fixes, plus the proof to run afterwards.
- `references/bug-empirical-reproduction.md` — a fix for a user-reported bug is not done until
  the reported scenario has been reproduced end to end against the real binary, before and after.
  Green unit and E2E tests have shipped an unfixed bug here; the transcript format is what
  catches that.

## The order

Write the failing test first and watch it fail for the reason its name gives — a bug fix starts
there, never with the production edit. That discipline is stated for the whole repository in
`aidd_docs/memory/coding-assertions.md`.
