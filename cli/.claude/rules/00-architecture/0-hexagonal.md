---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Layers Inside a Context

Where the tree is drawn is `0-contexts.md`. This rule is what holds inside one context, whichever it is.

## Layers

- `domain/` — entities, value objects, pure transforms, capability classes. No I/O.
- `domain/ports/` — interface contracts only, no implementation.
- `application/` — use cases: orchestration, one result type each.
- `infrastructure/` — port implementations, all I/O.

## Dependency direction

- Dependencies point inward: infrastructure → application → domain.
- Domain never imports from application or infrastructure.
- Application imports ports, never adapters.
- A context depends on another only along the edges `0-contexts.md` names, and on `kernel/` freely.

## Ports & Adapters

- Port: an interface under a context's `domain/ports/`, or `kernel/ports/` when two contexts need it.
- Adapter: an implementation with the `Adapter` suffix, under that context's `infrastructure/`, or under `runtime/` for a kernel port.
- Injected by constructor, typed as the port.

## Entry point

- `src/cli.ts` registers commands only — no business logic.
- `src/runtime/wiring/framework.ts` assembles the dependency graph.

## Type honesty

- No type is widened through `as unknown as`, `as any`, `as never`, `@ts-expect-error` or
  `@ts-ignore`, in `tests/` as much as in `src/` — `scripts/check-cli-layering.mjs` enforces
  it over both trees, and lists in `CASTS_ALLOWED` the ones the type system cannot express.

## Exceptions

- `CLIOutput` implements the `Logger` port from `presentation/`, which is neither a context nor an adapter directory.
