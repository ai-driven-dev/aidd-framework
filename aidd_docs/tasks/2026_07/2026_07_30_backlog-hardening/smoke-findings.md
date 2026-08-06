---
status: done
---

# Instruction: close the smoke-test findings

Ten scenarios ran the skills end to end. All ten completed, the checker exited zero
on every sandbox, and they produced 27 live findings. Work them one at a time.

## Tasks to do

### `1)` Blocking

> One defect stopped two runs.

1. **Relation cardinality is written nowhere.** `contract.js:23` treats `parents`, `depends_on`, `related_to`, `supersedes` as lists; the five `relations.md` list them beside the scalar `parent` without saying which is which. A scalar `supersedes` returns `INVALID_RELATION`, exit 1, recoverable only by reading the code. Decision: document the cardinality, or let `checkRelationShapes` accept a scalar on a list field.

### `2)` Two causes behind seven scenarios

1. **No action covers a transition alone on a persisted artifact.** Task and Defect say `persist or transition`; `07-epic/actions/03-finalize.md:3` and `02-user-stories/actions/07-finalize.md:3` say `approve and persist`, and derive the status from a draft review. Cancelling an Epic, starting a Story, reordering a set all had to re-enter through `shape`/`review` or `frame`/`write`/`assess`. Decision: a direct `source --> finalize` edge for a status or order event.
2. **Nothing executes child-to-parent propagation.** `00-backlog/references/events.md:14-16` states it, but no finalize action reaches the parent, and `events.md` lives in the orchestrator, never read by an agent invoked directly on an artifact skill. Decision: a `Propagate` step in each finalize, or a parent row in each `handoffs.md`.

### `3)` What the checker lets through

1. **A `ready` Story with a placeholder acceptance passes.** `contract.js:45` binds `Acceptance` to `done` only, while `02-user-stories/references/readiness.md:12` requires it at `ready`. `hasSection` already neutralises placeholders; only the wiring is missing.
2. **`contract.js:2` claims the docs and the code cannot drift.** They can: the test proves the existing rows fire, not that every documented rule has a row. Harden the claim or correct it.
3. **Transition legality and parent/child status coherence are unenforced.** An Epic `done` with no prior state passes; an Epic `cancelled` with `ready` children passes. Assumed since phase 5, never written down. Decision: a status rule in `checkGraph`, or state in the skills that this is the agent's charge alone.

### `4)` Undefined vocabulary

1. **`Gaps` section required by `04-assess.md:25`, defined nowhere**, absent from the Story template.
2. **`earned` and `unearned` sections, six occurrences, no definition.** The status-to-section map already exists at `contract.js:43-51`.
3. **A `done` Epic has nowhere to record confirmed evidence.** `epic-template.md:19` is predictive only; Task has a separate `## Completion Evidence`.
4. **The project's Definition of Done, the estimation scale and the ordering method point at no location.** Name the source and the fallback when it is absent.
5. **An Epic `goal` has no representable value for "none applies"**, and `review.md:6` keys its signal on presence, so free text silences it forever.
6. **`autonomous without bounds` has no downstream gate.** `modes.md:7` grants it; `06-decide.md:17` and every finalize know only bounded authority.
7. **`07-epic/actions/01-shape.md:27` asks for an open question its own `handoffs.md:3` forbids.** Align on `09-defect/actions/01-capture.md:26`.

### `5)` Minor

1. `order` written as a YAML integer returns as a string in the read model (`markdown.js` unquotes only).
2. `resolveLocalTarget` accepts both file-relative and project-relative paths; only the second is documented.
3. `supersede` is not a routable event; it is hand-composed from cancel plus create (`events.md:6`).
4. The `create/manage/review/refine` intents have no intent-to-action table.
5. `competing` is never defined (`06-order.md:25`).
6. `active` is used as a status in `review.md:6` while no lifecycle defines it.
7. The `Estimable` readiness row does not say it passes when the project does not estimate.
8. No field or section carries an Epic's cancellation reason.
9. How `07-apply` delegates (subagent? command?) is described nowhere.
10. `06-decide` and each finalize both hold an approval gate, with no rule saying whether one satisfies the other.
11. `01-inspect.md:20` clarifies on event, authority or support, never on an ambiguous scope.
12. Epic creation does not cascade into slicing; `03-finalize.md:20` only offers it.
13. A Story has no completion-evidence section while a Task does; the asymmetry is unexplained.
14. A Spike must name a Story in `parents` before the Story flow allows it to be written.
15. The `qualification.md` tables are one-line tautologies, with nothing to settle an Epic-versus-large-Story call.

## Test acceptance criteria

| Task | Acceptance criteria                                                        |
| ---- | ---------------------------------------------------------------------------- |
| 1    | A scalar and a list both behave as the skills say they will                  |
| 2    | A status change on a persisted artifact reaches its owner without re-drafting |
| 2    | A completed child reaches its parent from the artifact skill alone           |
| 3    | Every rule the skills state is either enforced or declared unenforced        |
| 4    | No term in a skill is undefined inside that skill                            |
| 5    | Each minor is fixed or recorded as accepted                                  |
