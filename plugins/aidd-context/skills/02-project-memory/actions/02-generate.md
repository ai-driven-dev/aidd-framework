# 02 - Generate

Write the memory the project deserves.

## Input

The confirmed capabilities from `01-scan`.

## Output

The written memory bank, and a report of what changed.

## Process

1. **Scaffold.** Create the tree in [structure.md](../references/structure.md).
2. **Select.** Take the rows to write from [memory-destinations.md](../references/memory-destinations.md).
3. **Write.** Write each selected row to its destination, against [memory-rules.md](../references/memory-rules.md).
   - The destination is the one the table names. Never derive a path.
   - Absent file: fill the template, strip its guidance comment.
   - Existing file: revise it in place.
   - Report a template section the file now lacks when the project has something for it. Never inject it.
4. **Prune.** A file on disk whose capability is no longer selected: flag it, offer to remove it, delete only on the user's word.
5. **Review.** Have each memory file reviewed against [review-protocol.md](../references/review-protocol.md) by an independent agent, a checker agent if the project has one, in parallel. Without subagents, make one fresh pass per file yourself, and say so in the report.
6. **Fix.** Apply the safe findings. On a duplicated fact, keep its home and drop the copy.
7. **Report.** Fill [report.md](../assets/report.md).

## Test

| Case | Pass |
| --- | --- |
| The bank is written | `find aidd_docs/memory -mindepth 2 -name '*.md'` returns nothing outside `internal/` and `external/` |
| A destination is checked | every `core` path and every [structure.md](../references/structure.md) path exists at its exact place |
| The scaffold is checked | `internal/` and `external/` each hold a `.gitkeep` and no memory file |
| A written file is read back | no `TODO` and no `<placeholder>` remains |
| The action runs again on a bank the user edited | the user's line survives and a flagged missing section stays absent |
