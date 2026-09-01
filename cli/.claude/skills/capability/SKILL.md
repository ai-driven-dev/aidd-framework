---
name: capability
description: >
  Creates or modifies a capability class in domain/capabilities/ and its corresponding Has*
  interface in contexts/tools/domain/contracts.ts. Use when adding a new tool runtime behavior (agents,
  skills, commands, rules, mcp, hooks, settings, plugins), changing the constructor params of
  an existing capability class, or wiring a new capability into an existing AiTool definition.
  Do NOT use for AI tool definitions — use `tool` instead. Do NOT use for domain value objects
  or discriminant unions — use `domain-model` instead. Do NOT use for pure string transforms
  — use `format` instead.
---

# Capability

Builds a capability class that encapsulates one tool runtime behavior and its corresponding
`Has*` interface in `contexts/tools/domain/contracts.ts`. Each capability class is instantiated in
exactly one `AiTool<C>` file; the `Has*` interface declares the typed field in the `C` parameter.

## Available actions

| #   | Action                   | Role                                                         | Input                                       |
| --- | ------------------------ | ------------------------------------------------------------ | ------------------------------------------- |
| 01  | `define-has-interface`   | Declare the Has* interface in contexts/tools/domain/contracts.ts      | capability name + field type                |
| 02  | `write-capability-class` | Write the capability class in domain/capabilities/           | Has* interface from 01                      |
| 03  | `wire-into-tool`         | Add the capability to an AiTool<C> definition                | capability class from 02                    |
| 04  | `test`                   | Write unit tests covering constructor params and public API  | completed capability from 02                |

## Default flow

`01 → 02 → 03 → 04`

Skip 01 when the `Has*` interface already exists in `contracts.ts` and only the class needs updating.
Skip 03 when the new capability is not yet needed by any existing tool (e.g. adding it speculatively).

## Transversal rules

- `Has*` interface lives in `contexts/tools/domain/contracts.ts`; the field type is the capability class.
- Capability class file lives in `domain/capabilities/<kebab-name>-capability.ts`; one class per file.
- Capability class name ends in `Capability` (e.g. `WidgetsCapability`).
- Constructor accepts a single params object; no positional arguments.
- All public fields are `readonly`; no setters.
- Throw `CapabilityConfigError` (from `kernel/errors.ts`) on invalid constructor params.
- Capability presence guard uses the `in` operator: `"widgets" in tool.capabilities` — never `instanceof`.
- Named export only; no default export.
- No `any` types.
- `.js` extensions on all relative imports.

## References

- `references/capability-conventions.md` — class shape, constructor params object, CapabilityConfigError, readonly fields
- `references/has-interface.md` — Has* interface placement, naming, and capability-presence guard

## Invariant rules

- `references/capability-conventions.md` — authoritative capability class rules
