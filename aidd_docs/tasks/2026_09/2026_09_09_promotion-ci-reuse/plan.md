---
objective: "A next-to-main promotion reuses its already-passing mutation gate while still validating the merge result."
status: implemented
---

# Plan: Reuse validated next CI during promotion

## Overview

| Field | Value |
| --- | --- |
| **Goal** | Remove the duplicate mutation matrix from promotion PRs without weakening normal PR gates. |
| **Source** | User request: SDLC the promotion-pipeline review towards `next`. |

## Phases

| # | Phase | File |
| --- | --- | --- |
| 1 | Reuse a validated promotion snapshot | [`phase-1.md`](./phase-1.md) |
| 2 | Lock the workflow contract | [`phase-2.md`](./phase-2.md) |

## Resources

| Source | Verified |
| --- | --- |
| https://docs.github.com/en/rest/actions/workflow-runs | Workflow runs can be filtered by branch, event, and head SHA with Actions read permission. |
| https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows | A pull-request checkout uses the synthetic merge ref, so a promotion-specific smoke can validate the merged result. |

## Decisions

| Decision | Why |
| --- | --- |
| Reuse only a successful `push` run for the exact snapshot SHA on `next`. | The promotion source has already satisfied `next`'s required gate; absent or unsuccessful proof must not bypass mutations. |
| Keep all non-mutation jobs on the promotion PR merge ref. | Coverage, smoke, build, and platform checks still validate the merge of release metadata from `main`. |
