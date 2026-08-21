---
objective: "aidd kanban --web launches a local HTTP server that streams the project's task documents as a live kanban board in the browser, reusing the existing domain and updating in real time via filesystem watching and SSE."
status: implemented
---

# Plan: Kanban web view

## Overview

| Field      | Value                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| **Goal**   | Add a browser-based kanban board to the existing CLI kanban, with live filesystem updates |
| **Source** | User request + aveleo-dev-ux2 patterns + aidd-kanban.md product brief                    |

## Phases

| #   | Phase                            | File                           |
| --- | -------------------------------- | ------------------------------ |
| 1   | Filesystem watcher adapter       | [`phase-1.md`](./phase-1.md)   |
| 2   | HTTP server and SSE streaming    | [`phase-2.md`](./phase-2.md)   |
| 3   | Frontend kanban board            | [`phase-3.md`](./phase-3.md)   |
| 4   | CLI command and bundling         | [`phase-4.md`](./phase-4.md)   |

## Decisions

| Decision                                                                | Why                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Columns keyed by ProgressStatus (5 buckets), not literal status strings | Literal statuses produce too many columns on real projects (findings.md evidence). ProgressStatus normalizes to a usable set |
| Node native `http` module, no framework                                 | The CLI is a short-lived tool; NestJS or Express adds weight the use case does not need                                      |
| Frontend served as embedded strings (HTML/CSS/JS bundled via tsup text loader) | No separate dev server in production; the CLI must be self-contained after `pnpm build`                              |
| Vanilla JS for the frontend, no React build step                        | Avoids a frontend build pipeline inside a CLI tool; scope is one screen with five columns                                    |
| SSE over WebSocket                                                      | Unidirectional server-to-browser push is all that is needed; SSE is simpler and needs no library                             |
| Watcher port in domain, adapter in infrastructure                       | Follows the existing hexagonal layout; the domain stays I/O-free                                                             |
