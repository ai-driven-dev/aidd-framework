---
objective: "Ship a TypeScript/Node CLI, cli-kaban, that scans a project's aidd_docs frontmatter and renders it as a scriptable table and an interactive kanban board, filterable by type and status."
status: implemented
---

# Plan: cli-kaban — AIDD Docs Kanban Viewer

## Overview

| Field      | Value                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Goal**   | Local CLI that turns any project's `aidd_docs` frontmatter into a table and a kanban view |
| **Source** | `./spec.md`                                                                                |

## Phases

| #   | Phase                                | File                         |
| --- | ------------------------------------- | ---------------------------- |
| 1   | Project bootstrap & tooling            | [`phase-1.md`](./phase-1.md) |
| 2   | Domain & application layer             | [`phase-2.md`](./phase-2.md) |
| 3   | Infrastructure: filesystem repository  | [`phase-3.md`](./phase-3.md) |
| 4   | Presentation: scriptable table command | [`phase-4.md`](./phase-4.md) |
| 5   | Presentation: interactive kanban board | [`phase-5.md`](./phase-5.md) |

## Decisions

| Decision                                                                 | Why                                                                                                                                                             |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Use `gray-matter` to parse YAML frontmatter                              | Standard, minimal library for exactly this problem; hand-rolling YAML parsing risks silent mis-parses on the malformed/partial frontmatter this tool must tolerate. |
| Use `ink` (React for CLIs) for the interactive kanban board                | Only mature option with keyboard-driven component model and strong TypeScript support; avoids hand-rolling cursor/box-drawing and input handling.               |
| Use `commander` for CLI argument parsing                                 | Matches the sibling `aidd-cli` project already in this workspace, keeping tooling conventions consistent across the two CLIs.                                    |
| Domain layer normalizes missing `type`/`status` to an explicit "unknown" | The spec requires undropped, non-crashing handling of incomplete frontmatter; this is a business rule, so it belongs in the domain layer, not the parser.       |
| Manual constructor injection in `cli.ts`, no DI framework/decorators      | This is a plain Node CLI, not a Nest/Next app — the NestJS-specific DI-token conventions do not apply; manual wiring in one composition root satisfies the same dependency-inversion intent. |
