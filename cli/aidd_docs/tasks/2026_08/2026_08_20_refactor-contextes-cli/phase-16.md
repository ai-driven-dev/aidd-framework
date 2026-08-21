---
status: pending
---

# Instruction: Move the command surface, by alias

Last, and by alias, for one reason: the e2e net invokes the CLI. Renaming breaks it at the moment it
is most needed. The new surface arrives beside the old, the tests move, the snapshot is recaptured,
then the old spelling goes.

The grammar is not invented: it is what Claude Code and Codex both follow without exception. A bare
verb performs an action; a noun then a verb manages a resource. `claude doctor` and `codex update`
act on the CLI; `claude plugin install` and `codex plugin add` manage a resource.

Today the same verb is declared four times — `update`, `status`, `list`, `doctor` — because the
grouping is by object. And `ai` and `ide` expose the same seven verbs for what is one subject.

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/presentation/commands/
    │   ├── ai.ts  ide.ts            ❌ delete (become the --tool flag)
    │   ├── status.ts  restore.ts  self-update.ts  ❌ delete (folded into doctor, sync, update)
    │   ├── framework.ts             ✏️ modify (install/update/remove; build becomes translate)
    │   ├── translate.ts             ✅ create (the core, visible in --help at last)
    │   ├── sync.ts                  ✅ create (the command ARCHITECTURE.md announced and never had)
    │   ├── doctor.ts                ✏️ modify (absorbs status, gains the tool inventory)
    │   ├── plugin.ts  marketplace.ts  ✏️ modify (aliases, no create)
    │   └── kanban.ts  telemetry.ts  ✏️ modify (open; enable/disable)
    └── tests/golden/snapshots/phase0/snapshot.json  ✏️ modify (recaptured on the new surface)
```

## User Journey

```mermaid
flowchart TD
  A[A user types a command] --> B{Bare verb or noun?}
  B -->|Bare verb| C[An action now: setup, doctor, sync, translate, clean, update]
  B -->|Noun then verb| D[A resource's lifecycle: framework, plugin, marketplace]
  E[--tool scopes any of them] --> C
  E --> D
```

## Test Scope

```mermaid
---
title: Test scope
---
journey
  section Setup
    both surfaces registered => old and new spellings answer: 5: cli
  section Happy path
    run each new command => same outcome as its old spelling: 5: cli
    run doctor without --tool => every tool reported, with what is wrong: 5: cli
    run sync on a drifted project => generated files regenerated: 5: cli
  section Edge case - the ambiguous verb
    a user types update with no subject => the CLI updates itself, and says so: 1: cli
  section Edge case - an old spelling
    a user types ai install cursor => it still works => a deprecation line names the new form: 1: cli
  section Teardown
    remove the aliases => only the new surface answers => the snapshot is recaptured once: 5: cli
```

## Tasks to do

### `1)` Add the new surface beside the old

1. `sync` first: it never existed, so nothing is replaced. Then `doctor` enriched with the tool
   inventory. Then `translate`, before `framework build` is retired.
2. Every old spelling keeps working and prints one line naming its replacement.

### `2)` Move the tests

1. e2e and golden invoke the new spellings. Recapture once, and review the diff as the behavior
   change it is.

### `3)` Retire the old surface

1. Remove `ai`, `ide`, `status`, `restore`, `self-update` and the aliases.
2. `--tool` is the single scope flag everywhere.

### `4)` Say what each adjacent command does

> Six pairs are close enough to be confused. One line each, in `--help`.

1. `marketplace refresh` re-fetches catalogs; `framework update` moves to a new version; `sync`
   rewrites owned files from what is already there.
2. `translate` converts an arbitrary source and records nothing; `sync` does the same conversion,
   driven by the manifest.
3. `setup` bootstraps the whole project; `framework install` acts on the framework alone.
4. `clean` removes AIDD from the project; `framework remove` removes the framework.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1    | Every new command produces the same outcome as the old spelling it replaces; every old spelling still works and names its replacement |
| 2    | The golden diff shows the invocation strings changing and nothing else |
| 3    | No verb is declared twice for the same subject; `--tool` scopes every command that accepts a scope |
| 4    | `--help` distinguishes the six adjacent commands in one line each |
| all  | A user coming from Claude Code or Codex finds `update`, `doctor` and the noun groups where those CLIs put them |
