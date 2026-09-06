---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Layers Inside a Context

Which context a concept belongs to is `0-contexts.md`. This is the shape that holds inside
one, whichever it is.

## The four layers

- `domain/`: entities, value objects, pure transforms, capability classes. No I/O. An
  invariant is validated at construction, so an invalid state is refused rather than stored.
- `domain/ports/`: interfaces only. No implementation, no import from infrastructure.
- `application/`: use cases. One class per use case, orchestration only, a typed result object
  returned, errors thrown rather than caught, and no branching on which tool is targeted. What
  a tool does differently is read from its capability class.
- `infrastructure/`: the port implementations, and every piece of I/O.

Dependencies point inward, infrastructure to application to domain. Biome holds it per layer:
`biome.json` carries one `noRestrictedImports` override per context and per layer, scoped so
that exactly one override matches a given file, and `import-rules-bite.arch.test.ts` fails
when a pattern names a directory the tree no longer has. That second check is what stops a
rule from reading like a boundary while matching nothing, which it did for six phases.

## Ports and adapters

- A port used by one context lives in that context's `domain/ports/`. A port two contexts both
  need lives in `kernel/ports/`.
- An adapter is named `*Adapter` and lives in that context's `infrastructure/`, or in
  `runtime/` when it implements a kernel port. It does I/O and format translation only: no
  business logic, no orchestration.
- It is injected through the constructor, typed as the port it implements, never as its class.
- One adapter implements one port. `FileAdapter` is the single exception on record, satisfying
  `FileReader`, `FileWriter` and `FileMerger` at once; it is debt, not a pattern to copy.
- A port declares no method nothing calls. `ports-are-called.arch.test.ts` keeps that baseline
  empty, because knip cannot see this shape: the adapter implementing a dead method counts as
  its user.

`CLIOutput` is the one implementation outside those directories. It satisfies the kernel's
`Logger` port from `presentation/output.ts`, because writing to a human is presentation's own
concern, and it carries no `Adapter` suffix for the same reason.

## Type honesty

No value is widened away from the type it claims to hold. `as unknown as`, `as any` and
`as never` are refused in `src/` and in `tests/` alike. `@ts-expect-error` and `@ts-ignore`
are refused in `src/` only, because a test whose point is that a shape does not compile has no
other way to assert it, and three tests rely on that.

`scripts/check-cli-type-honesty.mjs` enforces both scopes, run from the repository root. Its
`CASTS_ALLOWED` map lists the casts the type system cannot express away, each with the reason
it survives, and fails when a listed file stops casting: an allowance is a decision somebody
makes, not a default.

## Size

A directory carries at most ten direct `.ts` files (`folder-size.arch.test.ts`). Past that a
folder stops being a place and becomes a pile, so files stop finding their neighbours and the
same helper gets written twice. A directory over the limit is baselined with the count its
reason was written around, and the test asserts that count, so a reason nobody measured fails
here instead of surviving into four documents.
