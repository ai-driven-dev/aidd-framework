# 02 - Write

Write the memory the project deserves.

## Input

The confirmed capabilities, external tools, access modes and hand-offs.

## Output

The written memory bank.

## Process

1. **Scaffold.** Create the tree in [structure.md](../references/structure.md).
2. **Select.** Take the rows to write from [memory-destinations.md](../references/memory-destinations.md).
3. **Write.** Write each selected row to its destination, against [memory-rules.md](../references/memory-rules.md).
   - Absent file: fill the template, strip its guidance comment.
   - Existing file: revise it in place.
   - Report a template section the file lacks when the project has something for it. Never inject it.

## Test

| Case | Pass |
| --- | --- |
| The bank is written | every selected row of [memory-destinations.md](../references/memory-destinations.md) exists at its exact path |
| The tree is checked | no `.md` sits under `memory/` outside `internal/` and `external/`, and each holds a `.gitkeep` |
| A written memory file is read back | no `TODO` and no `<placeholder>` remains |
| A scaffolded doc is read back | its placeholders are untouched, they are the team's to answer |
| The action runs again on a bank the user edited | the user's line survives and a flagged missing section stays absent |
