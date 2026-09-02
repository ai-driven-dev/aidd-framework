# Reference: Shared Use Cases

## Location

`src/contexts/framework/application/shared/`

## Rules

- Never called from commands — only from other use-cases
- Same class shape as top-level use-cases: single `execute()`, typed `*Options` input, typed `*Result` output
- PostInstallPipelineUseCase is the canonical shared use-case for file + manifest writes

## When to create a shared use-case

Create a shared use-case when the same orchestration logic is needed by ≥2 top-level use-cases. Do not inline equivalent logic — import from `shared/`.

## Agnostic shape example

```typescript
// src/contexts/framework/application/shared/finalize-write-use-case.ts
export class FinalizeWriteUseCase {
  constructor(
    private readonly repo: RecordRepository,
    private readonly index: IndexWriter,
  ) {}

  async execute(options: FinalizeWriteOptions): Promise<FinalizeWriteResult> {
    await this.repo.save(options.record);
    await this.index.update(options.projectRoot, options.record);
    return { saved: true };
  }
}
```
