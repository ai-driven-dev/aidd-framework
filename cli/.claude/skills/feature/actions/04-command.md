# 04 - Command

Expose the feature in the CLI as a thin-wrapper command.

## Inputs

- `feature-description` (required) - string, what the CLI user invokes
- `use-case-name` (required) - string, the `*UseCase` class from 02

## Outputs

New or updated file in `src/application/commands/` and updated `src/cli.ts`.

## Depends on

- `02-use-case`

## Process

1. If the change is an internal refactor that does not expose a new CLI surface, skip this action and document: "04 skipped — no new CLI surface".
2. Invoke the `command` skill starting at its `01-declare-surface` action.
3. Complete all three actions of the `command` skill (`declare-surface → write-handler → register`).
4. Confirm `pnpm build` exits 0 and the new command appears in `--help` output before proceeding to 05.

## Test

`pnpm build` exits 0 and the command name appears in the `--help` output — same as the `command` skill's `03-register` action test.
