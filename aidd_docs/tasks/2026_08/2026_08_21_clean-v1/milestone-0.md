---
status: pending
---

# Milestone 0: What exists reaches someone

Nothing new is built. Everything already works and nobody can use it.

## Why first

Nine delivered tickets sit on one branch. That is the largest risk in this plan and it
grows every hour it stays there — every later milestone touches the same files, and a
conflict resolved in a week costs more than one resolved today.

## What it holds

| # | What | Effort |
| --- | --- | --- |
| — | **Merge the branch.** Nine tickets, reviewed as one chain rather than nine diffs. | half a day |
| #658 | **The FAQ promises no telemetry while we ship it.** `docs/FAQ.md` is the sentence people quote when asking whether the framework watches them. One paragraph is already corrected; the entry needs a whole read. | an hour |
| — | **A delivery page.** What it does, what it does not, per tool, in the words a person would use to explain it. `docs/telemetry-limits.md` is the material; this is the front of it. | an hour |

## Done when

- The plugin can be installed by someone who did not write it, and answers what a session cost.
- No published sentence claims the framework measures nothing.
- What is not covered is written down where a user looks, before they ask.

## Explicitly not here

Any new coverage, any new tool, any new figure. This milestone's whole value is that it
adds nothing.
