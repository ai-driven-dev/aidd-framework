# Reading sources

What the scan reads to understand the project, and what survives the reading. Read widely, keep
little: `memory-rules.md` wants a small file, and most of what a repository shows is re-derivable by
opening it again.

## Read in this order

| Source                                       | Answers                                      |
| -------------------------------------------- | -------------------------------------------- |
| the manifest, and a lockfile beside it        | the stack, the workspaces, the published name |
| the root README, then any `docs/`             | what it does, for whom, its domain words      |
| the top-level directories                     | the shape, and which areas own what           |
| the entry points the manifest declares        | where execution starts                        |
| every file under the VCS platform's own directory | how it ships, and what runs on its own schedule |
| the test configuration and one test file      | the layers, the tools, the conventions        |
| the code, area by area                        | what the writing above got wrong              |

Stop at the first source that answers a question. Read the code last: it is the most expensive and
the least quotable, and it exists to correct the others, not to be summarised.

## Keep or drop

This table judges what the reading yields, never what a memory file already holds. A line the user
wrote stays whatever the verdicts below say.

| Signal                                                        | Verdict |
| ------------------------------------------------------------- | ------- |
| a decision, and the constraint behind it                      | keep    |
| a convention the files repeat without stating                 | keep    |
| a gotcha, a trap, a thing that surprises a newcomer           | keep    |
| the stack, and how the main parts fit                         | keep    |
| the domain words a contributor must know to read the code     | keep    |
| a fact one open file re-derives                               | drop    |
| a file tree, a schema, a dependency list                      | drop    |
| a version number                                              | drop    |
| anything true of every project built this way                 | drop    |
| a work item, a live value, a technical id                     | drop    |
| a plan, a wish, a thing not shipped                           | drop    |

## Depth

- Every workspace of a monorepo, never the root manifest alone.
- A directory whose name repeats across areas is read once, not per area.
- Nothing under a dependency directory, a build output, or a path the VCS ignores.
