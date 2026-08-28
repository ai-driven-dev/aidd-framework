<!-- Two outputs. Print the first, write the second, and remove this comment. -->

## Printed once, at any terminal width

```txt
Memory bank — <n> on disk, <n> gaps, <n> findings

  <file>.md              missing
  <file>.md              orphan
  <file>.md              <n>
  <file>.md              <n>

  aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_memory-check/report.md
```

No table, and one file per line. A terminal is narrow: a table reflows into unreadable blocks, and
so does a line that lists several files. Keep every line under forty characters, the path aside.

## Written to that path

### Structure

What the tables prove. Same answer every run.

| File        | Gap     | Why                                   |
| ----------- | ------- | ------------------------------------- |
| `<file>.md` | missing | the capability always holds           |
| `<file>.md` | missing | `structure.md` scaffolds it           |
| `<file>.md` | orphan  | no destination row produces it        |

### Findings

What the reviewers saw this run. Another run may see more.

| File        | Finding                          | Evidence                            |
| ----------- | -------------------------------- | ----------------------------------- |
| `<file>.md` | `<the claim the file makes>`     | `<the fact that settles it>`        |
| `<file>.md` | names a path that does not exist | `<the path>`                        |

### Duplicated facts

| Fact      | Home        | Copy        |
| --------- | ----------- | ----------- |
| `<fact>`  | `<file>.md` | `<file>.md` |

### Notes

- `<file>.md` — `<what this run could not settle about it>`

Notes hold what this run could not settle about the bank, and nothing else. Name a file, a
capability, a fact about the project. Never how this skill works, never one of its steps: the reader
wants their bank, not its machinery.

- One row per file, per finding, per duplicated fact. Never a paragraph in a cell.
- A finding is a fragment; its evidence is the fact that settles it.
- Drop a table, a column, or a section that has nothing to say.
