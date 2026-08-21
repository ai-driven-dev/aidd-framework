---
status: pending
---

# Milestone 2: It cannot lie quietly

Everything so far is verified. None of it is proven under load, and nothing yet detects a
silent failure in the field.

## Why here and not earlier

#617 exists to catch an installation that reports itself healthy while producing nothing.
Written before milestone 1, it would spend its time reporting the two failures already
known. Written after, everything it reports is news.

## What it holds

| # | What | Effort |
| --- | --- | --- |
| #617 | **A skill that proves the pipeline fires.** Not "is the switch on" — is a session being recorded, is it readable, does it join. The three answers are already distinguishable in the data; this is the thing that asks. | half a day |
| — | **Prove it at scale.** A year of day files, a hundred sessions, a large task tree. Measure the period read, the sweep, and the turn-end walk. Nothing here has ever met more than three sessions. | half a day |
| — | **Prove a multi-step flow live.** One skill gives two rows. A real SDLC chain gives several, and that is where interval closing, reconciliation across five steps, and interleaved skills stop being unit tests. Costs a real session on a small task. | an hour, plus tokens |
| #686 | **A synthetic transcript message is not a billed request.** Seven records of 5134 in one measured session. Small, and it inflates a figure. | an hour |
| #689-adjacent | **A budget for the turn-end walk.** The observed pass walks the task tree once per turn. Capped at 2000 entries today, unmeasured on a real repository. | an hour |

## Done when

- A deliberately broken install — hook unregistered, switch off, tool unreadable — is named as broken rather than answered with a zero.
- A period holding a hundred sessions answers, and how long it takes is written down.
- A live multi-step flow reports each step separately and reconciles to the total.

## The question this milestone actually settles

Whether a figure can be trusted without the person reading it having built the thing.
