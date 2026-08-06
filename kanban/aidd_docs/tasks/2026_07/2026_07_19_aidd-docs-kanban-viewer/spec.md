---
name: aidd-docs-kanban-viewer
description: Local CLI that parses aidd_docs frontmatter and shows AIDD task status as a table or an interactive kanban board
type: spec
status: pending
---

# cli-kaban — AIDD Docs Kanban Viewer

## Target

Provide a local CLI tool that scans a target project's `aidd_docs` directory, parses the YAML frontmatter of every markdown document found there, and presents an at-a-glance status view of all AIDD task documents (master plans, plans, decisions, specs, reviews, etc.) as both a scriptable table and an interactive terminal kanban board grouped by status.

## Hard constraints

- Runs entirely locally: no network calls, no external service, no telemetry.
- Delivered as a TypeScript/Node.js command-line tool.
- Operates against exactly one target project per run: a project path is passed as an argument and defaults to the current working directory; the tool reads only that project's `aidd_docs/` folder.
- Recursively parses YAML frontmatter from every `.md` file under `aidd_docs/`, at minimum extracting `name`, `description`, `type`, and `status` when present.
- A document with a missing, malformed, or absent `type` or `status` field is still surfaced (under an explicit "unknown" bucket), never dropped silently and never a crash.
- Supports narrowing the displayed set by `type` and by `status`.
- Ships two output modes: a plain, scriptable tabular/list output suitable for piping, and an interactive terminal kanban board with one column per distinct `status` value, keyboard-navigable.

## Non-goals

- Aggregating or merging `aidd_docs` from more than one project in a single view.
- Writing, editing, or moving any file under `aidd_docs/` — the tool is read-only.
- A web UI, desktop GUI, or any interface beyond the terminal.
- Integration with external issue trackers (Jira, Linear, GitHub Issues, etc.).
- Changing or extending the AIDD framework's frontmatter schema or its skills.

## Done-when

- Running the CLI against a project path prints a table listing every `aidd_docs` markdown document found, with at least its name, type, and status.
- Running the CLI with no path argument targets the current working directory's `aidd_docs` folder.
- Running the CLI in interactive mode opens a terminal kanban board with one column per distinct status value present in the scanned documents, each document rendered as a card under its status column.
- Applying a type filter and/or a status filter narrows the displayed documents to only those matching, identically in both the table output and the interactive board.
- A document whose frontmatter lacks a `type` or `status` field still appears in the output, grouped under an explicit "unknown" bucket rather than causing an error or being silently omitted.

## Stakeholders

- Decider: francois.duval.auto@gmail.com
- Owner: francois.duval.auto@gmail.com
- Consumer: francois.duval.auto@gmail.com

## Context

- Frontmatter convention observed across existing AIDD-managed projects (`aidd-cli`, `firstId`, `jdr`, `RollDiceDiscord`, `aidd-framework`): every `aidd_docs` markdown file opens with a YAML block carrying at least `name`, `description`, `type` (e.g. `master_plan`, `plan`, `decision`, `spec`, `review`), and commonly `status`.
- Plan status lifecycle reference: `pending → in-progress → implemented → reviewed`, with `blocked` reachable from any active state (see `aidd-dev` `01-plan` skill, `references/plan-status.md`). Master plans use their own child-plan status set (`pending`, `in-progress`, `done`, `blocked`).
- Sibling project `aidd-cli` (TypeScript, pnpm, tsup, vitest, biome) is the stack-consistency reference for this tool, chosen so both CLIs share tooling conventions.
