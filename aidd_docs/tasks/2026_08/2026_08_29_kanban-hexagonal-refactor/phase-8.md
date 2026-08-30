---
status: pending
---

# Instruction: `interactive --live` opt-in watcher refresh

> Not part of the hexagonal-refactor pass (phases 1-7). This is the "second temps" improvement:
> give the ink view the same live refresh the web view already has, behind an explicit flag.
> Run this phase only after phases 1-7 are `done` and the hexagon holds.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
kanban/src/presentation/
├── commands/
│   └── interactive-command.ts       ✏️ add `--live` option (default false); pass runtime.createWatcher only when set
└── components/
    └── status-columns-view.tsx      ✏️ optional createWatcher prop; when present, subscribe on mount, stop on unmount
kanban/tests/presentation/
├── commands/interactive-command.test.ts    ✏️ `--live` forwards a watcher factory; bare `interactive` does not
└── components/status-columns-view.test.tsx  ✏️ fake watcher: firing onChange re-runs the injected use case; unmount calls stop()
```

## User Journey

```mermaid
flowchart TD
  A[aidd kanban interactive] --> B{--live?}
  B -- no --> C[fetch once on mount, render, process ends]
  B -- yes --> D[render with createWatcher prop]
  D --> E[useEffect: watcher.start(projectPath); watcher.onChange => re-run injected use case => setTaskGroups]
  E --> F[touching a .md re-renders the board, debounced 500ms in the adapter]
  D --> G[unmount => watcher.stop, no open handles]
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    Fixture aidd_docs tree + fake use case + fake watcher with a triggerable onChange => inputs ready: 5: system
  section Happy path
    Run interactive --live => board renders; fire the watcher => the injected use case runs again and the view updates: 5: cli
  section Edge case - no flag
    Run interactive without --live => no createWatcher prop, no FSWatcher created: 1: cli
  section Teardown
    Unmount the view => watcher.stop() called, no open handles: 5: cli
```

## Tasks to do

### `1)` Add the `--live` option to `interactive-command.ts`

1. `.option("--live", "refresh the board when a task document changes", false)`.
2. When `options.live` is true, pass `runtime.createWatcher` as a prop; otherwise omit it.
3. Signature stays `(program, runtime, onError)` from phase 1.

### `2)` Subscribe in `status-columns-view.tsx`

1. Add an optional prop `createWatcher?: () => TaskDocumentWatcher`.
2. When provided, a dedicated `useEffect` builds one watcher, calls `start(runtime.projectPath)`, registers `onChange` to re-run the injected `listTaskDocuments` and `setTaskGroups`, and returns a cleanup that calls `stop()`.
3. When absent, behaviour is exactly phase 2's fetch-once. No polling, no extra render path.

### `3)` Update tests

1. `interactive-command.test.ts`: `--live` results in a watcher factory reaching the view; bare `interactive` does not.
2. `status-columns-view.test.tsx`: with a fake watcher, firing `onChange` triggers a second `execute`; unmounting calls `stop()`; without the prop, no watcher method is ever called.

## Test acceptance criteria

| Task | Acceptance criteria                                                                            |
| ---- | ------------------------------------------------------------------------------------------- |
| 1    | `aidd kanban interactive` creates no `FSWatcher`; `aidd kanban interactive --live` does       |
| 2    | Under `--live`, editing a fixture `.md` re-runs the injected use case and updates the board; unmount stops the watcher |
| 3    | `pnpm --dir kanban test` green; the fetch-once path is unchanged when `--live` is absent      |
