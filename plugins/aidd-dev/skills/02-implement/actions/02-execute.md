# 02 - Execute

Loop the plan's phases in order, coding each until every acceptance criterion holds.

## Input

The prepared plan on its feature branch, from `01-prepare`.

## Output

Every phase coded, asserted, and its frontmatter marked `status: done`, with the commits on the branch. Or a stop at `status: blocked` when a human is needed, or a `replan needed` report on any drift from the plan.

## Process

1. **Open.** Walk the phases in order. In a feature folder each is a `phase-<n>.md` next to `plan.md`. Set its `status: in-progress` as a runtime marker; no commit yet.
2. **Code.** Build the phase scope against its acceptance criteria.
3. **Assert.** Assert the phase against its acceptance criteria. On failure, repair and repeat. The gate is the assertion passing, not a self-report. Once it passes, set `status: done` and commit the phase as one unit, its code and its status together.
4. **Guard.** Stop the loop on either condition:
   - **Blocked** (see [blocked.md](../references/blocked.md)): set the plan `status: blocked`, commit, stop.
   - **Drift**: any mismatch with the plan, trivial or substantive, stop and report `replan needed: <reason>`. Never rewrite the plan; replanning is the caller's job.

## Test

- A phase reaches `status: done` only after assert passes against its acceptance criteria, in one commit with its code (`git status --short` shows no dangling phase edits).
- The branch holds one commit per phase; there are no separate `in-progress` status commits.
- A blocker leaves the plan `status: blocked` with no later phase run.
