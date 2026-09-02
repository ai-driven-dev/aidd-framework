# Reference: commander wiring

How a command registers itself and declares its surface. Commander.js.

## Command registration

- One `register*Command(program)` function per file, in `src/presentation/commands/`
- All commands registered in `cli.ts` — no business logic there
- Deps created inside the action handler, never in `register*Command`
- Parent + subcommand pattern: `const parent = program.command("x"); parent.command("sub")...`

## Action handler contract

- Wiring only: parse globals → guards → create deps → call one use-case → display result
- No helper functions (formatters, counters, predicates) inside command files
- No business logic inside action handlers — extract to use-cases or domain models

## Options

- Camel-case option names in code, kebab-case in CLI flags
- `.requiredOption("--source <path>", "desc")` for mandatory inputs
- `.option("--flat", "desc")` for optional boolean/value flags
- Provide defaults in the `.option()` declaration when applicable
- Validate inputs via `output.error()` + `process.exit(1)` — never `throw`

## Example (parent + subcommand)

```typescript
const widget = program.command("widget").description("Widget management tools");

widget
  .command("apply")
  .description("Apply a widget configuration to the project")
  .requiredOption("--id <id>", "Widget identifier")
  .requiredOption("--target <target>", "Target environment (dev, prod)")
  .option("--dry-run", "Preview changes without writing files")
  .option("--force", "Overwrite existing configuration")
  .action(async (cmdOptions: { id: string; target: string; dryRun?: boolean; force?: boolean }) => {
    // ...thin-wrapper handler (see references/thin-wrapper.md)
  });
```
