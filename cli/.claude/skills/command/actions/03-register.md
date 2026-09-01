# 03 - Register

Add the `register*Command` call to `cli.ts` so the command appears in the CLI.

## Inputs

- `register-function` (required) - string, the `register<Name>Command` function name from 01

## Outputs

```typescript
// src/cli.ts (additions only)
import { registerWidgetCommand } from "./commands/widget.js";

// Inside the setup section:
registerWidgetCommand(program);
```

## Depends on

- `01-declare-surface`

## Process

1. Open `src/cli.ts`.
2. Add an `import { register<Name>Command }` at the top with a relative path ending in `.js`.
3. Call `register<Name>Command(program)` in the command registration section — after existing `register*` calls and before `program.parse()`.
4. Do NOT add any logic to `cli.ts` beyond the import and the one registration call — see `references/commander.md`.
5. Confirm `cli.ts` still has zero `createDeps` calls, zero `new *Adapter()` calls, and zero business logic.

## Test

Run `pnpm build` — exits 0 and the new command appears in `pnpm start -- --help` output.
