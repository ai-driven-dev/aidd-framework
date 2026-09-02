---
name: command
description: >
  Creates or modifies CLI commands in src/presentation/commands/. Use when adding a new command
  or subcommand, changing flags or the action handler, registering a command in cli.ts, or
  reviewing a command for thin-wrapper compliance. Do NOT use for implementing business logic —
  use `use-case` instead. Do NOT use for infrastructure changes — use `adapter` instead.
---

# Command

A CLI command is a thin wrapper. It wires user input to exactly one use-case and displays the
typed result. It holds no business logic. These actions keep it that way.

## Available actions

| #   | Action              | Role                                              | Input                                   |
| --- | ------------------- | ------------------------------------------------- | --------------------------------------- |
| 01  | `declare-surface`   | Define command name, description, and flags       | command name + flag list                |
| 02  | `write-handler`     | Write the thin-wrapper action handler             | surface from 01 + use-case name         |
| 03  | `register`          | Add the register call to cli.ts                   | command file from 01-02                 |

## Default flow

`01 → 02 → 03`

## Transversal rules

- One `register<Name>Command(program: Command): void` per file; no logic outside the action handler.
- Action handler wires only: parse globals → flag guards → createDeps → one use-case → display → catch.
- Flag guards abort via `output.error()` + `process.exit(1)` — never `throw`.
- Exactly one use-case call; never chain multiple use-cases or add orchestration logic.
- All deps via `createDeps` / `createMenuDeps`; zero `new *Adapter()` in commands or `cli.ts`.
- Display through `CLIOutput` channels only — no helper methods, no domain formatting logic.
- Named export only.

## References

- `references/thin-wrapper.md` — action-handler contract, interactive mode rules, handler template
- `references/commander.md` — command registration, options, flag conventions
- `references/wiring.md` — createDeps / createMenuDeps usage + CLIOutput channels

## Invariant rules

- `.claude/rules/00-architecture/0-deps-wiring.md` — authoritative deps-wiring rules
