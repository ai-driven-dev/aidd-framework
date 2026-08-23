---
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
---

# Hexagonal Architecture

## Layers

- `domain/models/` — entities, value objects, discriminant types
- `domain/ports/` — interface contracts only, no implementations
- `domain/formats/` — pure string transforms (TOML, JSON, Markdown, placeholders)
- `domain/capabilities/` — capability classes (agents, commands, hooks, mcp, plugins, rules, settings, skills)
- `domain/tools/contracts.ts` — `AiTool<C>`, `Has*` interfaces, `IdeToolConfig`
- `domain/tools/registry.ts` — tool registry, `ToolConfig` union, guards
- `domain/tools/ai/` — AI tool definitions (claude, cursor, copilot, opencode, codex)
- `domain/tools/ide/` — IDE tool definitions (vscode)
- `application/use-cases/` — orchestrators, sub-use-cases in subdirs (`install/`, `update/`, `sync/`, `auth/`, `shared/`)
- `application/commands/` — CLI wiring only
- `infrastructure/adapters/` — port implementations, all I/O

## Dependency direction

The layer sections above and below describe `src/`. A test sits outside the layers and may
wire an adapter to a use-case; only the type-honesty rule holds over both trees.

- Dependencies point inward: infrastructure → application → domain
- Domain never imports from application or infrastructure
- Application imports ports, not adapters

## Ports & Adapters

- Port: interface in `domain/ports/`
- Adapter: implementation in `infrastructure/adapters/` with `Adapter` suffix
- Inject adapters via constructor, typed as port interface

## Entry point

- `cli.ts` wires commands only — no business logic
- `deps.ts` assembles the dependency graph

## Type honesty

- No type is widened through `as unknown as`, in `tests/` as much as in `src/`
- A double that cannot satisfy its port is a signal to implement the port or narrow it;
  swapping the cast for `as any`, `as never`, `@ts-expect-error` or `@ts-ignore` is the
  same hole under another name
- A deliberately malformed input is taken in as the widest honest type the function accepts
- `scripts/check-cli-layering.mjs` enforces this over both trees; a cast the type system
  genuinely cannot express is listed in its `CASTS_ALLOWED` with the reason it survives

## Exceptions

- `CLIOutput` (Logger adapter) lives in `application/`, not `infrastructure/`
