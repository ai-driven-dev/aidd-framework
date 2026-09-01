# Reference: Use Case Rules

## Class shape

- Class with `*UseCase` suffix
- Single `async execute(options: *Options): Promise<*Result>` method
- Input typed as `*Options` interface, output typed as `*Result` interface
- No `async function` exports — always a class

## Constructor injection order

FileSystem → Repository → Loader → Hasher → Logger → Platform → Prompter

All dependencies injected as `private readonly`, typed as port interfaces (never concrete adapter types).

## Method size

- Every method (public or private) must be ≤ 20 lines
- Extract private helpers before reaching the limit
- Helper names describe domain intent, not mechanics

## Throws

- Throw on domain errors — no try/catch inside use-cases
- Typed domain exceptions from `src/kernel/errors.ts` — never `new Error("string")`
- The caller (command layer) catches via `errorHandler.handle()`

### Legitimate try/catch carve-outs (not violations)

Three patterns are permitted; all others are violations requiring a fix.

**1. Global-runner (aggregate-error) pattern**

`*-all-use-case.ts` files that iterate over N scopes (tools, plugins, marketplaces) and must
complete all iterations even if one fails. The try/catch wraps a single iteration body, pushes a
typed error entry to an `errors[]` array, and continues. The outer `execute()` returns a result
object that contains the errors array — it never swallows failures silently.

```typescript
const errors: ScopeError[] = [];
for (const scope of scopes) {
  try {
    await this.processScopeUseCase.execute(scope);
  } catch (err) {
    errors.push({ scope: scope.id, message: toMessage(err) });
  }
}
return { ...summary, errors };
```

**2. Cache/network fallback pattern**

Use-cases that first try a network port and fall back to a cached result on failure. The try/catch
wraps the network call only; the catch returns or yields the cached value. There must be a log/warn
call in the catch to surface the failure.

```typescript
try {
  return await this.networkPort.fetch(url);
} catch {
  this.logger.warn("Network unavailable, using cached data");
  return await this.cachePort.read(key);
}
```

**3. Typed-throw translation**

A use-case that calls a third-party or lower-level operation and needs to translate an opaque
`unknown` error into a typed domain exception. Catch, inspect, re-throw as typed. Never swallow.

```typescript
try {
  await this.port.doSomething(options);
} catch (err) {
  throw new DomainSpecificError(toMessage(err));
}
```

Any try/catch NOT matching one of these three patterns is a violation and must be removed.

## User file protection

- Before any `fs.writeFile()` on framework files: check `fs.fileExists(path)` AND `!manifest.isFileTracked(relativePath)`
- If both true → skip write, emit `logger.warn()`, never add to manifest
- Never overwrite a user-owned file

## Prompter restrictions

- Prompter is for domain interaction only (conflict resolution, strategy selection)
- Never use Prompter for CLI input collection in use-cases
- CLI input collection belongs in the command layer

## No technical strings in use-cases

- No hardcoded runtime names, OS hook names, system file paths in use-cases
- Technical integration details belong in adapters

## Agnostic shape example

```typescript
export class ApplyWidgetUseCase {
  constructor(
    private readonly fs: FileReader & FileWriter,
    private readonly repo: WidgetRepository,
    private readonly logger: Logger,
  ) {}

  async execute(options: ApplyWidgetOptions): Promise<ApplyWidgetResult> {
    const existing = await this.repo.find(options.widgetId);
    if (existing && !options.force) {
      return { widgetId: options.widgetId, applied: false, skipped: true };
    }
    const files = await this.buildOutputFiles(options);
    await this.writeFiles(files, options);
    return { widgetId: options.widgetId, applied: true, skipped: false, fileCount: files.length };
  }

  private async buildOutputFiles(options: ApplyWidgetOptions): Promise<WidgetFile[]> {
    // ... ≤20 lines, domain-intent name
  }

  private async writeFiles(files: WidgetFile[], options: ApplyWidgetOptions): Promise<void> {
    // ... ≤20 lines, domain-intent name
  }
}
```
