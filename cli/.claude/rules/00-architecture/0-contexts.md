---
description: Apply when adding or moving a module; keeps the import chain one-way and the kernel free of business logic.
paths:
  - "src/**/*.ts"
---

# Contexts

Organise by bounded context, never by layer.

## Chain

- Allowed edges live in `tests/architecture/helpers.ts` (`ALLOWED`).
- Arrows run one way, toward the kernel.
- `presentation` and `runtime` depend on any context.
- A context depending on either is `BASELINE` debt; it only shrinks.
- `context-graph.arch.test.ts` fails any other edge.
- `biome-context-parity.arch.test.ts` holds `biome.json` to the same data.

## Kernel

- `kernel/` imports no context.
- Keep only shared vocabulary: types, pure helpers, typed errors.
- A port two contexts need lives in `kernel/ports/`.
- A domain decision is never kernel material.
- Measurement vocabulary sits in `kernel/measurement.ts`; `tools` never imports `telemetry`.

## Interior

- Import only a module listed in `PUBLIC_MODULES` (`context-boundary.arch.test.ts`).
- Everything else is internal.
- Never leave a context to re-enter it (`context-self-reentry.arch.test.ts`).

## Adding

- Pick the owning context first.
- A use case fitting nowhere means the contexts are wrong.
- Cross through the target's public module, in the allowed direction.
- Wrong direction: the caller sits in the wrong context.
- Placement is `aidd_docs/memory/codebase-map.md`, held by `codebase-map.arch.test.ts`.
