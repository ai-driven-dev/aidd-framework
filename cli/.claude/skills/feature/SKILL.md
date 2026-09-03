---
name: feature
description: >
  Macro workflow for building or changing a vertical slice of the CLI. Use as the entry point
  when adding a new end-to-end feature or when a change touches more than one context. Do NOT
  use for a change confined to one context — go straight to that context's skill (`tools`,
  `translate`, `distribution`, `framework`).
---

# Feature

A vertical slice crosses contexts in the same order the dependency chain allows:
`framework → translate → tools → kernel`, with `framework → distribution` alongside it. This
skill sequences that crossing; it never inlines a context's own conventions — each step
delegates entirely to the context skill that owns the concept at that point.

## Default flow

1. **Which context does this concept belong to?** Read `aidd_docs/memory/codebase-map.md`'s
   "Where to Add Things" table, or ask: does it define what a tool is (`tools`), translate
   canonical content to a target (`translate`), decide where content comes from (`distribution`),
   or record what happened to a project (`framework`)? A feature usually starts in `framework`,
   since that is the only context allowed to reach the others.
2. **Work outward from there, one context skill at a time**, in dependency order
   (`framework` → `translate` → `tools`, or `framework` → `distribution`) — never against it. A
   `framework` use-case may need a new build contract in `tools`; write that first, then wire
   `framework` to it. Skip a context entirely when the change does not touch it, and say so
   explicitly (e.g. "translate skipped — no new target-aware transform needed").
3. **Expose it, if the feature needs a CLI surface.** A command lives in `presentation/commands/`:
   parse flags → guard → `createDeps`/`createMenuDeps` → call exactly one use-case → display the
   typed result → catch via `errorHandler.handle()`. No business logic in the command file. See
   `.claude/rules/00-architecture/0-deps-wiring.md` for the wiring contract. Skip this step for an
   internal change that exposes no new surface.
4. **Test it.** Use the `test` skill for tier conventions. Every context touched gets coverage at
   the tier its change belongs to; never skip this step.

## Conditional: adding a launcher

A launcher (an external binary the CLI runs but does not embed) is `framework`'s
concern — see that skill's "Launchers" note. Locate the binary and spawn it; never deep-import
its source.

## Transversal rules

- Each step delegates fully to the relevant context skill or rule. Do not inline a context's
  own conventions here — that duplication is exactly what this refactor removed.
- The three invariants — the chain, the kernel's no-context/no-logic rule, and no reaching into a
  context's undeclared interior — are not re-explained per feature. They are enforced by
  `tests/architecture/context-graph.arch.test.ts` and `context-boundary.arch.test.ts`; a slice
  that violates one fails there, not here.
- A new module a downstream context must call needs to be added to the owning context's declared
  public surface (`PUBLIC_MODULES` in `context-boundary.arch.test.ts`) — an internal file is
  invisible outside its own context by design.
- Never skip the test step; skipping the CLI-exposure step is common and fine for internal-only changes.

## External data

- `aidd_docs/memory/codebase-map.md` — "Where to Add Things" table for placement
- `.claude/skills/tools/SKILL.md`, `.claude/skills/translate/SKILL.md`,
  `.claude/skills/distribution/SKILL.md`, `.claude/skills/framework/SKILL.md` — the four context skills
- `.claude/skills/test/SKILL.md` — test tier conventions
- `.claude/rules/00-architecture/0-contexts.md` — the three invariants
- `.claude/rules/00-architecture/0-deps-wiring.md` — command wiring contract
