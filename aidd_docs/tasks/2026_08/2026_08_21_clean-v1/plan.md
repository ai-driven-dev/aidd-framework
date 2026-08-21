---
objective: "Measurement anyone can install, that records on every declared tool, that cannot claim a figure it did not measure, and that says so out loud where it cannot."
status: pending
---

# Plan: A clean v1

## Overview

| Field      | Value                                                             |
| ---------- | ------------------------------------------------------------------- |
| **Goal**   | From a branch nobody has run to something a team can be handed       |
| **Source** | Epic #631, and what seven delivered tickets left standing            |

## Where this starts

Delivered and unmerged: #663, #684, #685, #687, #629, #689, #690, #691, #692. The chain
works end to end on Claude Code, proven on live headless sessions rather than on fixtures.

What that does **not** mean, and the plan exists for the gap:

| Reads as | Actually |
| --- | --- |
| tested | 2614 CLI tests, 177 hook tests, two live probes — and nobody has run it for a week |
| works on Claude Code | proven live; Codex proven on captured files; Copilot and Cursor record nothing |
| shipped | on a branch, behind a FAQ that promises the opposite |

## Milestones

| #   | Milestone                        | File                                     | Done when |
| --- | -------------------------------- | ---------------------------------------- | --------- |
| 0   | What exists reaches someone      | [`milestone-0.md`](./milestone-0.md)     | a person outside this branch can install it and read a figure |
| 1   | Every declared tool records      | [`milestone-1.md`](./milestone-1.md)     | the journal is real on four hosts, not one |
| 2   | It cannot lie quietly            | [`milestone-2.md`](./milestone-2.md)     | a broken install says so, and a big one still answers |
| 3   | The figures leave the machine    | [`milestone-3.md`](./milestone-3.md)     | a service outside this repository prices them |

Run them in order. Each one is worth stopping at: milestone 0 is deliverable on its own,
and every later one is a strictly better version of the same product rather than a
prerequisite for it.

## Decisions

| Decision | Why |
| --- | --- |
| Merging comes before any new work | Nine tickets on one branch is the largest risk in this plan, and it grows every hour. Nothing below is worth more than reducing it. |
| Coverage before depth | A tool that records nothing is a tool whose users see a zero. That is worse than a tool whose figures lack a breakdown, and it is cheaper to fix. |
| The diagnostic comes after coverage, not before | #617 exists to catch an installation that reports itself healthy while producing nothing. Written before #681 and #680, it would mostly report the two failures we already know about. |
| Nothing here computes an amount | The rates live in the SaaS. This repository's job ends at emitting figures complete enough to price, and every milestone respects that. |
| Scale is proven, not assumed | Nothing has been run against a year of day files or a hundred sessions. Until it has, "it scales" is a hope. |
