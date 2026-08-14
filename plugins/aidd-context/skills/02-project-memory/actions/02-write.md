# 02 - Write

Write the memory the project deserves.

## Input

The confirmed capabilities, external tools, access modes and hand-offs.

## Output

The written memory bank.

## Process

1. **Scaffold.** Create the tree in [structure.md](../references/structure.md).
2. **Select.** Take the rows to write from [memory-destinations.md](../references/memory-destinations.md).
3. **Write.** Write each row to its destination against [memory-rules.md](../references/memory-rules.md).
   - Absent file: fill the template, strip its guidance comment.
   - Existing file: revise it in place, keeping every line the user wrote.
   - A section the file lacks: report it when the project has something for it, never inject it.

## Test

| Case | Pass |
| --- | --- |
| Bank written | every selected row exists at its exact path |
| Tree | no `.md` under `memory/` outside `internal/` and `external/`, each holding a `.gitkeep` |
| Memory file | no `TODO` and no `<placeholder>` remains |
| Scaffolded doc | its placeholders are untouched |
| Rerun | the user's line survives, a flagged missing section stays absent |
