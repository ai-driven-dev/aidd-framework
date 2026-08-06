---
status: done
---

# Instruction: close the second smoke-test findings

Thirteen scenarios ran after the first round of fixes. All thirteen completed, the
checker exited zero everywhere, and no legal write was refused. They produced
nineteen live findings and confirmed the three fixes under test.

Six frictions were dropped after verification: five misread a file that says what
the agent wanted, one was contradicted by running the code.

## Tasks to do

### `1)` Blocking

1. **An artifact can be born in a terminal status.** A Task written straight to `status: done` passes the full checker and the pre-write hook alike: `check-backlog.js:66` returns early on any creation, and nothing compares a new artifact's status to a legal starting point. The skills also disagree on what that point is: `09-defect/actions/01-capture.md:28` pins `status: reported`, `10-task/actions/01-frame.md:28` says `valid status`, `07-epic/actions/01-shape.md:28` says `lifecycle-valid status`. Decision: is creating straight at `ready` legitimate, or does an artifact always start at its first status?

### `2)` Material, needing a ruling

1. **A Story has nowhere to record its completion evidence** while a Task carries `## Completion Evidence` and a Defect `## Verification`. Either give it a section, or state that its acceptance is the proof.
2. **An Epic with no `goal`: two files, two verdicts.** `07-epic/references/readiness.md:6` accepts an absent field; `00-backlog/references/review.md:6` flags the same state. Neither says one is a gate and the other a standing review.
3. **What a `ready` Defect must hold: three sources, three answers.** `09-defect/references/readiness.md:10` wants a Resolution; `09-defect/actions/03-finalize.md:32` does not list it; `contract.js` does not require it; the template ships it.
4. **`accepted assumption` is never defined**, though it is the exact line between legitimate use and invention. `07-epic/actions/01-shape.md:19` allows it while `:17` forbids inference, and `readiness.md:7-8` gives `Context` an assumption escape that `Boundaries` lacks.

### `3)` Material, mechanical

1. **`status` is missing from the four `Authorize` lists.** On a purely transitional request no listed field moves, so a literal reading authorises nothing. Introduced when those four lines were normalised.
2. **`Success Evidence` is unsatisfiable at draft time.** The template asks for the signal *and what it showed*, while the section is required from `ready`, before anything has shown.
3. **Proposing the parent's fate has no step, no test, no handoff row, and no check.** The rule lives in four `lifecycle.md`; nothing operationalises it.
4. **A Story sent back to `proposed` has nowhere to write its blocker.** `04-assess.md:18` says to list them; the template has no section and body metadata is rejected.
5. **Placeholders pass wherever a section is not required at the current status.** The `<...>` strip runs only inside `hasSection`, itself called only for `REQUIRED_SECTIONS` rows.

### `4)` Minor

1. The Epic template offers no place for `goal`, `source` or the relations its `relations.md` defines.
2. `<slug>` is never defined; placement only checks the folder.
3. `## Completion Evidence` ships with a placeholder, against `leave the rest out`.
4. `ready Story needs Acceptance` fires when the heading exists but empties on strip; absent and empty are not distinguished.
5. `this Epic is ready to decompose` implies a status nothing verifies.
6. The Story mermaid has no Spike exit although its `handoffs.md` defines one; no skill diagrams a handoff, so confirm the convention rather than patch one flow.
7. `with the reason in the body` names no heading; three scenarios invented three places. Introduced in the first minors pass.
8. The Spike is the only artifact without an `already persisted` route; an existing Spike re-enters through `create`.
9. Resolving a deictic target (`start that task`) is undescribed outside the orchestrator.

## Test acceptance criteria

| Task | Acceptance criteria                                                           |
| ---- | ------------------------------------------------------------------------------- |
| 1    | A new artifact starts where the skills agree it starts, and something proves it |
| 2    | Each ruling is recorded with its reason, in the file that owns it               |
| 3    | Each rule the skills state has a step, a test, or a check that reaches it       |
| 4    | Each minor is fixed or recorded as accepted                                     |
