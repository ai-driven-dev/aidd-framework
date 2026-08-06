# cli-kaban — Fixture-Verified Extraction & Status-Column Views

## Target

Prove the frontmatter extraction correct against a representative set of fixture documents, and present scanned tasks as status columns — as the tool's primary interactive terminal view, and as a non-interactive export usable for scripting — with each task's sub-documents nested beneath it showing their own individual status untouched.

## Hard constraints

- Frontmatter extraction is covered by fixture markdown files exercising, at minimum: a fully-populated valid document, a document whose `status` value is not one of the statuses the tool already recognizes, a document missing `type`, a document missing `status`, a document with unparseable/malformed YAML frontmatter, and a document whose description body text itself contains the words "status" or "type" (to prove body content is never mistaken for frontmatter fields).
- Each fixture's expected extracted `name`/`type`/`status` (or its fallback to `unknown`) is asserted explicitly in a test — no fixture exists without a corresponding assertion.
- The tool's primary command is an interactive terminal view; a non-interactive export output also exists and remains usable for scripting/piping.
- Both the interactive view and the export are covered by tests proving that data extracted from `aidd_docs` reaches the rendered output end-to-end, unaltered, for every field the fixtures exercise — not only that the domain/parsing layer alone extracts correctly in isolation.
- The column a task appears under, in both views, is keyed by that task's own top-level document's status exactly as extracted (no normalization into a smaller fixed set of buckets, no aggregation from its sub-documents).
- A sub-document (e.g. a phase belonging to a plan) never changes which column its parent task appears under, regardless of the sub-document's own status — this is an explicit, deliberate limitation for this iteration, not an oversight.
- A sub-document is rendered nested beneath its parent task, showing its own status as plain accompanying text.
- In the interactive view, when the terminal is too narrow to show every column at full width, status and task name stay legible first — other details shrink or drop before either of those two does.
- The rendered column layout fits within the current terminal's width rather than overflowing it unmanaged.
- No network calls, no external service, no telemetry — the tool remains entirely local, consistent with the rest of cli-kaban.
- The tool remains read-only against `aidd_docs/`.

## Non-goals

- Aggregating or advancing a parent task's status based on its sub-documents' statuses (e.g. marking a task "in-progress" because a sub-document is) — explicitly deferred to a future iteration.
- Guaranteeing scrollable output with a column header that stays pinned while scrolling — acceptable as a bonus if the chosen approach provides it for free, but not a required outcome here.
- Choosing or naming any specific library, file, or code pattern — that belongs to the plan.

## Done-when

- Running the extraction test suite passes, with each of the fixture cases listed under Hard constraints individually asserted against its expected extracted `name`/`type`/`status` (or `unknown`) result.
- Launching the interactive terminal view against a project's `aidd_docs` shows one column per distinct status value present among that project's top-level task documents, headed by that status's name.
- Running the export against the same project produces the same task-to-column assignment as the interactive view, in a non-interactive, scriptable form.
- Every top-level task document appears under the column matching its own status, in both views; every sub-document belonging to it is visible nested beneath it, displaying its own status as plain text, without altering which column its parent appears under.
- Narrowing the terminal width in the interactive view keeps status and task name readable, shrinking or dropping other details first.
- The printed columns, in both views, stay within the terminal's current width rather than wrapping unpredictably or running off-screen.

## Stakeholders

- Decider: francois.duval.auto@gmail.com
- Owner: francois.duval.auto@gmail.com
- Consumer: francois.duval.auto@gmail.com

## Context

- Builds on the already-shipped `cli-kaban` tool (spec/plan at `../2026_07_19_aidd-docs-kanban-viewer/`). Its first iteration shipped both an interactive terminal board and a `list` export, then a later, unmerged iteration (branch `feature/list-progress-columns`) removed the interactive view in favor of `list` alone, grouped into a normalized 5-value progress bucket (`todo`/`in-progress`/`done`/`blocked`/`unknown`) derived from each document's own status.
- This iteration reinstates an interactive terminal view as the tool's primary command, keeps `list` as the non-interactive export counterpart, and changes the column grouping key (in both) to each top-level task's own literal status value, plus introduces parent/sub-document nesting. Whether the previously-built normalized progress bucket survives as a separate, independent filter is a plan-level decision.
- Real-world `aidd_docs` folders (verified against the sibling `firstId` project) carry inconsistent and sometimes unrecognized raw status values (e.g. `completed`, which the tool did not previously special-case) — the fixture set exists to lock down behavior on exactly this kind of input.
