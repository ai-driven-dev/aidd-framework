---
status: done
---

# The reader finds the journal, and says so when it cannot

## Frame

### The observed fault

`aidd telemetry report --days 30 --json` answers differently depending on the directory it
is run from, on the same machine, against the same sink and the same journals.

| run from | requests | `by_task` |
| --- | --- | --- |
| `cli/` | 1106 | one row, `"reason": "no-declaration"`, 100% |
| the repository root | 29207 | four named tasks, 3.1% |

Neither number is the interesting part. The `reason` is: `"no-declaration"` is a positive
claim about the work — *this session declared no task*. What actually happened is that the
reader never found the journal directory at all. An unknown was reported as a zero, which
is the one thing this project's own rules refuse.

### The cause, measured

The hook that writes a journal and the CLI that reads it do not anchor at the same place.

| | anchor | code |
| --- | --- | --- |
| writer | the repository root | `getRepoLocation(cwd)` → `git rev-parse --show-toplevel`, then `<root>/aidd_docs/runs` (`plugins/aidd-telemetry/hooks/lib/repo.cjs:310`) |
| reader | the process working directory | `projectRoot: process.cwd()` (`cli/src/application/commands/global-options.ts:16`), then `join(projectRoot, DOCS_DIR, RUNS_SUBDIR)` (`cli/src/infrastructure/adapters/run-journal-reader-adapter.ts:193`) |

Run from `cli/`, the reader looks in `cli/aidd_docs/runs`, which does not exist. `readdir`
throws, `list()` answers `[]`, no session has an interval, and `taskUnattributedReason`
returns `"no-declaration"` because `intervals.length === 0` is the only branch it has.

### Two faults, not one

Fixing the anchor alone would leave the lie in place for every case the anchor cannot
reach: a repository with no `aidd_docs/runs` at all, a report run outside any repository, a
sink holding records from a project whose journals are on another machine. In each, a
person is still told the work declared no task.

So the fix is in two parts, and the second is the one that matters:

1. The reader anchors where the writer anchored.
2. A record whose session has **no journal at all** is its own reason, distinct from a
   record whose session has a journal that declared nothing.

### Decisions

**The anchor is found by walking up for `.git`, not by shelling out to git.** The writer
uses `git rev-parse --show-toplevel`; the reader reaches the same directory by walking up
from `projectRoot` for a `.git` entry — a file for a linked worktree, a directory for a
main checkout, both accepted. No subprocess on a read path that runs on every report, and
the same answer for every layout this repository is developed in. `AIDD_RUNS_DIR` still
overrides both, unchanged.

**Only the journal reader's anchor moves, not `projectRoot` itself.** `projectRoot` also
drives the manifest, auth and the marketplace; moving it would relocate plugin
installation, which is a different change with a different blast radius. That the project
marketplace source `"path": "."` also resolves against the process cwd is a separate
finding, named here and not fixed here.

**The new reason is per record, not a period-level field.** `read` already carries
`identity_unusable` for a period-level unknown, and a second field beside it would say
"some session somewhere had no journal" — true and useless. `TaskUnattributedReason` is
already the vocabulary for *why this record belongs to no task*; a fourth value is the
existing mechanism, not a parallel one. `Record<TaskUnattributedReason, string>` in
`cost-report-display.ts:44` makes the compiler enumerate every consumer.

**The journal is not moved to the user profile.** It was considered and refused:

- the journal holds repository-relative paths (`aidd_docs/tasks/2026_09/…`), anchored by
  `taskFolderRelativePath(repoRoot, …)`; outside the repository they resolve to nothing;
- two worktrees of one repository would share one directory, and one task path would name
  two different trees — this very change is being written in such a worktree;
- it fixes neither fault: an empty global directory still cannot tell "no journal" from
  "no declaration".

The real tension it was meant to answer stays, and is stated rather than solved: the sink
is per user, the journal is per repository, so records made in project B and read from
project A have no journal and never will. `by_project` already separates them, and after
this change they read `"no-journal"`, which is what they are.

**The step and flow axes are out of scope, and the reason is not symmetry.** Their
`unattributed` row asserts nothing about the work — it says this layer could not place the
record, which stays true whether a journal was missing or silent. Only `by_task` and
`by_backlog` make a positive claim that can be false.

## Phases

| # | Phase | Proves |
| --- | --- | --- |
| 1 | The reader anchors at the repository root | a report run from a subdirectory finds the journal |
| 2 | A session with no journal is its own reason | `"no-journal"` never reads as `"no-declaration"` |
| 3 | The contract says both | envelope version, contract document, artefact and display labels |

Each phase is test-first: the test is written, run, and watched to fail for the reason it
names, before the code that satisfies it exists. Each guard ships with the mutation that
proves it.

## Check

An independent checker read the plan, the diff and the repository, and returned six findings
and a verdict of not shippable. Every one was reproduced before being acted on, and every one
is now closed:

| # | Finding | What it actually was | Closed by |
| --- | --- | --- | --- |
| 1 | Moving only the journal reader desynchronizes the backlog reader | Real, and worse than the fault being fixed: from a subdirectory `by_task` named the task while `by_backlog` said that task declared no backlog item. Reproduced as `expected 'none' to be 'declared'` | `repositoryRootAbove` extracted to `infrastructure/repository-root.ts` and applied to `TaskBacklogAdapter` too, with its own test and mutation |
| 2 | Four consumers of the version were missed and the suite is red | Real. `npx vitest run` does not build, and the e2e tier runs `dist/cli.js` — the project's gate is `pnpm test` (`pnpm build && vitest run`). The green reported was against a stale binary | Two e2e expectations and the envelope fixture updated; every later gate run through `pnpm test` |
| 3 | The new reason claims more than it knows | Real. A journal whose `session_start` header is torn is read and then dropped (`report-cost-use-case.ts:102`), so its records reach this reason. "No journal was read at all" was false for that case, where the old label had been true | Reworded to "no usable run journal" in the label, the type and the contract, and pinned by a test that refuses the old wording |
| 4 | Eight doc sentences the diff itself falsified | Real. `Record<TaskUnattributedReason, string>` forces the compiler to enumerate consumers; it cannot enumerate prose | All eight corrected |
| 5 | The cost skill's report template offers no cell for the fourth reason | Real, and its version paragraph was three bumps stale | Template and paragraph brought to version 11; the pinned claim count raised 17 → 18 with its reason |
| 6, 7 | "the three, and only three" heading four bullets; two unwrapped lines | Real, cosmetic | Reworded and rewrapped |

Two guards were added that would have caught what slipped: the contract document's own
worked example is now pinned to the emitted version (it had drifted to `8` while the prose
said `10`), and the wording of the new reason is pinned against the claim the checker
proved false.

## Result

Ten axes, every one reconciling to the period total exactly, measured on a copy of a real
machine's sink with the built binary. The report now answers identically from the repository
root and from a subdirectory, and says `"no-journal"` — not `"no-declaration"` — where it
had no usable journal to read.
