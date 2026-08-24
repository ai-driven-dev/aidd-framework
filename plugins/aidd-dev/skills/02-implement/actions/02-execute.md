# 02 - Execute

Loop the plan's phases in order, coding each until every acceptance criterion holds.

## Input

The prepared plan on its feature branch, from `01-prepare`.

## Output

Every phase coded, asserted, and its frontmatter marked `status: done`, with the commits on the branch. Or a stop at `status: blocked` when a human is needed, or a `replan needed` report on any drift from the plan.

## Process

1. **Open.** Walk the phases in order. In a feature folder each is a `phase-<n>.md` next to `plan.md`. Open every referenced UI contract, exact system revision, and required delta before setting the phase `status: in-progress`.
2. **Revalidate.** Apply the prepare gate again immediately before each phase, including absence of a competing active contract for establishment. Any changed status, base, revision, body, scope ownership, or missing dependency returns `replan needed` without editing the phase.
3. **Code.** Build the phase scope against its acceptance criteria and the complete referenced UI contract. Implement only approved deltas listed under `Implement deltas`; each must be owned by exactly this phase. Treat verified deltas and approved deltas owned by completed phases as read-only dependencies. Missing or duplicate ownership returns `replan needed`.
4. **Assert.** Assert the phase against its acceptance criteria, UI contract behaviors, and delta verification conditions. On failure, repair and repeat. The gate is the assertion passing, not a self-report. Once it passes, set `status: done` and commit the phase as one unit, its code and its status together. Delta verification remains an explicit `01-system reconcile` operation; do not edit delta status locally.
5. **Guard.** Stop the loop on either condition:
   - **Blocked** (see [blocked.md](../references/blocked.md)): set the plan `status: blocked`, commit, stop.
   - **Drift**: any mismatch with the plan, trivial or substantive, stop and report `replan needed: <reason>`. Never rewrite the plan; replanning is the caller's job.

## Test

- A phase reaches `status: done` only after assert passes against its acceptance criteria, in one commit with its code (`git status --short` shows no dangling phase edits).
- The branch holds one commit per phase; there are no separate `in-progress` status commits.
- A blocker leaves the plan `status: blocked` with no later phase run.
- UI contracts and deltas are opened and asserted, not treated as metadata only.
- An approved delta is implemented by one phase; a verified delta is never reimplemented.
