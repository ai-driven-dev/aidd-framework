---
status: done
---

# Instruction: run the backlog for real

Nothing here has ever been executed. The 46 tests prove the checker, not the
skills; the coherence pass walked 28 scenarios by reading files. `aidd_docs/backlog/`
does not exist in this repo.

Run it end to end, on this repo, and record what breaks.

## Tasks to do

### `1)` Walk one backlog through its whole life

> Each write passes under the `PostToolUse` hook. Stop at the first surprise and record it.

1. Frame an Epic from a real need in `ROADMAP.md`.
2. Slice it into Stories, order them, estimate them.
3. Block one Story with a Spike; conclude the Spike; resume the Story.
4. Open a Defect, attach a Task to it, complete both.
5. Complete a Story, then complete the Epic with its success evidence.
6. Cancel a second Epic that still has live children.
7. Send a feature request to `09-defect` and a mismatch to `07-epic`, and check both redirect.

### `2)` Watch the two known gaps

> Both are structural, not accidental. Decide from the run whether they matter.

1. No artifact carries an iteration or milestone, while `memory/backlog.md` declares both as conventions. Ordering exists, committing to a sprint does not.
2. Nothing answers a question about the backlog. `03-review` finds health problems; no action lists what is `ready`, what is blocked, or what comes next.

### `3)` Watch what the paper pass could not judge

1. Does an autonomous run without bounds stay inside the resolved scope, or does it drift?
2. Does a skill invoked alone behave like the same skill invoked by the orchestrator?
3. Does the write-time hook stay silent through a multi-artifact change set?

## Test acceptance criteria

| Task | Acceptance criteria                                                            |
| ---- | -------------------------------------------------------------------------------- |
| 1    | The seven steps complete, and the checker exits zero on the resulting backlog    |
| 1    | Every surprise is written down with the file and the step that produced it      |
| 2    | Each gap is either judged harmless in practice or turned into an issue          |
| 3    | The three behaviours are observed, not inferred                                 |
