# 01 - Declare Surface

Define the commander command name, description, and all flags.

## Inputs

- `command-name` (required) - string, kebab-case CLI name (e.g. `install`, `framework build`)
- `flags` (required) - list of flags with types (required/optional, value/boolean)

## Outputs

```typescript
export function registerWidgetCommand(program: Command): void {
  program
    .command("widget")
    .description("Apply widget configuration to the project")
    .requiredOption("--id <id>", "Widget identifier")
    .option("--force", "Overwrite existing configuration")
    .action(async (cmdOptions: { id: string; force?: boolean }) => {
      // handler in 02
    });
}
```

## Process

1. Create `src/presentation/commands/<kebab-name>.ts`. One file per top-level command; subcommands live in the same file.
2. Declare `export function register<PascalName>Command(program: Command): void`.
3. Chain `.command("name")`, `.description("...")` on `program` (or on a parent command for subcommands) — see `references/commander.md`.
4. Add `.requiredOption("--<flag> <value>", "desc")` for mandatory inputs.
5. Add `.option("--<flag>", "desc")` for optional inputs; provide defaults inline in `.option()` when applicable.
6. CLI flags use kebab-case; their TypeScript names in `cmdOptions` use camelCase — see `references/commander.md`.
7. Leave the `.action()` body empty for now — filled in 02.

## Test

Run `pnpm typecheck` — exits 0 confirms the function signature and Commander option types compile.
