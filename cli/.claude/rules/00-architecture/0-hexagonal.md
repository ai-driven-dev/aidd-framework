---
description: Apply inside a context; four layers, dependencies pointing inward, one adapter per port.
paths:
  - "src/contexts/**/*.ts"
  - "src/runtime/**/*.ts"
---

# Layers Inside a Context

Which context owns a concept is `0-contexts.md`.

## Layers

- `domain/`: entities, value objects, pure transforms, capabilities. No I/O.
- Validate an invariant at construction.
- `domain/ports/`: interfaces only.
- `application/`: one class per use case, orchestration only.
- Never branch on the targeted tool; read its capability class.
- `infrastructure/`: port implementations and every piece of I/O.
- Dependencies point inward; `biome.json` holds one `noRestrictedImports` override per layer.
- `biome.json`'s `noRestrictedGlobals` refuses `process` in `domain/` and `application/`; take a port.
- `import-rules-bite.arch.test.ts` fails a pattern naming a vanished directory.

## Ports and adapters

- One context: `domain/ports/`. Two: `kernel/ports/`.
- Name an adapter `*Adapter`, in `infrastructure/`; `runtime/` for a kernel port.
- An adapter does I/O and format translation only.
- Inject through the constructor, typed as the port.
- One adapter, one port; `FileAdapter` is recorded debt.
- A port declares no uncalled method (`ports-are-called.arch.test.ts`, empty baseline).
- `CLIOutput` implements the kernel `Logger` from `presentation/output.ts`.
