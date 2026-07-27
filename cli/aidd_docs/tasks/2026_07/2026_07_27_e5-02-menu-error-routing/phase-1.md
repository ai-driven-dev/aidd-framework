---
status: done
---

# Instruction: Route menu errors through ErrorHandler

## Architecture projection

> Tree of the final files. ✅ create · ✏️ modify · ❌ delete

```txt
.
└── cli/
    ├── src/application/commands/menu.ts             ✏️ modify (route non-abort errors)
    └── tests/application/commands/
        └── menu-error-routing.unit.test.ts          ✅ create
```

## Tasks to do

### `1)` Export a testable routing seam

1. In `menu.ts`, add:
   ```ts
   /** ExitPromptError = the user pressed Ctrl-C at a prompt; a clean exit, not a failure. */
   export function routeMenuError(error: unknown, errorHandler: ErrorHandler): never {
     if (error instanceof Error && error.name === "ExitPromptError") process.exit(0);
     return errorHandler.handle(error);
   }
   ```
2. Both branches terminate the process, so the return type is `never` — no fallthrough back into the loop.

### `2)` Use it in the loop

1. Build the handler once before the loop: `const errorHandler = new ErrorHandler(new CLIOutput());`.
2. Replace the `catch` body with `routeMenuError(error, errorHandler)`.
3. Import `ErrorHandler` from `../error-handler.js` and `CLIOutput` from `../output.js`.

### `3)` Cover the fixed behavior

1. Create `tests/application/commands/menu-error-routing.unit.test.ts`.
2. Stub `process.exit` (throw a sentinel so the `never` path is observable) and pass a fake `ErrorHandler` that records what it received.
3. Assert: an `ExitPromptError` exits 0 **without** reaching the handler; any other error **does** reach `errorHandler.handle` with the original error — the regression that was silently swallowed before.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| 1-2  | A non-abort failure inside the menu prints its message to stderr and exits non-zero, instead of looping silently forever. |
| 1-2  | Ctrl-C at a menu prompt still exits 0 silently — unchanged. |
| 3    | The new test fails if the `errorHandler.handle` call is removed (i.e. if the silent-swallow regresses). |
| all  | `tsc --noEmit` clean, full suite green. |
