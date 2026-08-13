<!-- Two outputs. Print the first, write the second, and remove this comment. -->

## Printed once, at any terminal width

```txt
Memory bank — 8 on disk, 2 missing, 32 findings

  deployment.md          8
  architecture.md        6
  codebase-map.md        6
  vcs.md                 3
  browsing.md            orphan
  ecosystem.md           missing
  memory/README.md       missing

  aidd_docs/tasks/2026_08/2026_08_13_memory-check/report.md
```

No table, and one file per line. A terminal is narrow: a table reflows into unreadable blocks, and
so does a line that lists several files. Keep every line under forty characters, the path aside.

## Written to that path

| File             | State   | Why                            |
| ---------------- | ------- | ------------------------------ |
| architecture.md  | drifted |                                |
| browsing.md      | orphan  | no destination row produces it |
| ecosystem.md     | missing | the capability always holds    |

| File            | Finding                       | Evidence                               |
| --------------- | ----------------------------- | -------------------------------------- |
| architecture.md | says Node.js 20               | `engines.node` is `>=22.12`            |
| architecture.md | names `scripts/build-dist.sh` | no such file, the build is in `ci.yml` |

| Fact                | Home            | Copy            |
| ------------------- | --------------- | --------------- |
| plugin enumeration  | architecture.md | codebase-map.md |

Close the written report with a `## Notes` section when something the run could not decide needs
saying, for example a capability that holds in the repo but was not confirmed by a scan.

- One row per file, per finding, per duplicated fact. Never a paragraph in a cell.
- A finding is a fragment; its evidence is the fact that settles it.
- Drop a table, a column, or a section that has nothing to say.
