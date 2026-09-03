<!-- Fill both tables from the scan, show them, and remove this comment. -->

Here is what I read. Correct me before I write.

| Capability     | Holds because                                  |
| -------------- | ---------------------------------------------- |
| core           | always                                          |
| ecosystem      | always                                          |
| `<capability>` | `<the path or dependency that proves it>`       |
| `<capability>` | `<the path or dependency that proves it>`       |

| Tool             | Human    | Agent    | Owned by      |
| ---------------- | -------- | -------- | ------------- |
| `<vcs platform>` | `<mode>` | `<mode>` | `<file>.md`   |
| `<tool>`         | `<mode>` | `<mode>` | `<file>.md`   |
| `<tool>`         | `<mode>` | none     | none          |

Then ask for what the repo cannot prove: a tool nobody committed, an access mode, a hand-off between
two tools. Name what is missing rather than asking an open question.

- One row per capability, one row per tool. The evidence is a path or a dependency, never a claim.
- A capability that holds always says so; do not invent evidence for it.
- Drop the second table when the project reaches nothing outside itself.
