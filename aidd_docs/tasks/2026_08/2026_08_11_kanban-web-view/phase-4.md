---
status: done
---

# Instruction: CLI command and bundling

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
kanban/
└── src/
    └── presentation/
        └── commands/
            └── ✅ web-command.ts

cli/
├── src/
│   └── application/
│       └── commands/
│           └── ✏️ kanban.ts
└── ✏️ tsup.config.ts
```

## User Journey

```mermaid
flowchart TD
  User["aidd kanban web ."] --> CLI["CLI parses args"]
  CLI --> Deps["Inject deps via KanbanCommandDeps"]
  Deps --> Server["KanbanWebServer.start()"]
  Server --> Watcher["Watcher starts on aidd_docs/"]
  Server --> Listen["HTTP server listens on port"]
  Listen --> Print["Print: Kanban board at http://localhost:3000"]
  Print --> Open["Browser opens automatically"]
  Open --> Wait["Server runs until Ctrl+C"]
  Wait --> Stop["SIGINT => server.stop()"]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Build CLI with pnpm build => dist/cli.js exists: 5: cli
  section Happy path
    Run aidd kanban web . => server starts, URL printed: 5: cli
    Open printed URL in browser => kanban board loads: 5: browser
    Ctrl+C => server stops cleanly, process exits 0: 5: cli
  section Edge case - port flag
    Run aidd kanban web . --port 8080 => server starts on 8080: 1: cli
  section Edge case - missing aidd_docs
    Run on a dir without aidd_docs/ => board shows empty state, no crash: 1: cli
```

## Tasks to do

### `1)` Create the web command registration

> Register `aidd kanban web [path]` as a subcommand.

1. Create `web-command.ts` in `kanban/src/presentation/commands/`
2. Accept `[path]` argument (default: cwd) and `--port <number>` option (default: 3000)
3. Instantiate `FilesystemTaskDocumentRepository`, `FilesystemTaskDocumentWatcher`, `KanbanWebServer`
4. Call `server.start()`
5. On SIGINT, call `server.stop()` and exit cleanly
6. Open browser automatically via `child_process.exec` (`xdg-open` / `open` / `start` by platform)

### `2)` Mount the web command in the CLI

> Wire the new subcommand into the existing kanban command group.

1. In `cli/src/application/commands/kanban.ts`, import `registerWebCommand`
2. Add `registerWebCommand(kanban.command("web"), deps)` alongside existing interactive and list registrations

### `3)` Configure tsup to bundle frontend assets

> Make HTML, CSS, and JS importable as strings.

1. In `cli/tsup.config.ts`, add `.html` and `.css` to the esbuild `loader` map (same as `.md` => `text`)
2. Verify `pnpm build` succeeds and the frontend files are inlined in `dist/cli.js`

### `4)` End-to-end smoke test

> Verify the full chain works from CLI to browser.

1. `pnpm build` in cli/
2. Run `node dist/cli.js kanban web .` from the framework root
3. Verify the URL is printed
4. Open the URL, verify the board renders with the framework's own tasks
5. Ctrl+C, verify clean exit

## Test acceptance criteria

| Task | Acceptance criteria                                                                |
| ---- | ---------------------------------------------------------------------------------- |
| 1    | `aidd kanban web .` starts a server and prints the URL                             |
| 1    | `--port 8080` makes the server listen on 8080                                      |
| 1    | Ctrl+C stops the server and exits with code 0                                      |
| 2    | `aidd kanban --help` does not show `web` (hidden like the parent kanban command)    |
| 2    | `aidd kanban web --help` shows path argument and port option                        |
| 3    | `pnpm build` succeeds, `dist/cli.js` contains the HTML string                      |
| 4    | Browser loads the board from the built CLI binary                                   |
