# 04 - Wire Errors and Pipeline

Add typed error throws and delegate manifest+file writes to PostInstallPipelineUseCase.

## Inputs

- `use-case-file` (required) - string, path to the use-case file from 03

## Outputs

```typescript
// Error throw example
import { WidgetNotFoundError } from "../../../kernel/errors.js";

if (!inventory.isTracked(widgetId)) {
  throw new WidgetNotFoundError(widgetId);
}

// Pipeline delegation example (delegate file writes + record save — never inline both)
await new FinalizeWriteUseCase(this.repo, this.indexWriter).execute({
  projectRoot: options.projectRoot,
  record: updatedRecord,
});
```

## Depends on

- `03-extract-methods`

## Process

1. For every error condition in the use-case, throw a typed domain exception from `src/kernel/errors.ts`. Never `throw new Error("user string")` — see `.claude/rules/00-architecture/0-error-handling.md`.
2. Identify all `manifestRepo.save()` calls. Replace each with a `PostInstallPipelineUseCase` delegation per `references/post-install-pipeline.md`.
3. Confirm `GitignoreUseCase` is never called directly — it must flow through the pipeline.
4. Add the `PostInstallPipelineUseCase` import from `../shared/post-install-pipeline-use-case.js`.
5. Confirm the use-case has no `try/catch` block — errors propagate to the caller (command layer) — see `.claude/rules/00-architecture/0-error-handling.md`.

## Test

Run `pnpm typecheck` and `pnpm test:unit` (or `pnpm test:integration` for integration-tier tests) — both exit 0.
