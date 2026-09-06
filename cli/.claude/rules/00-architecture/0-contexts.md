---
paths:
  - "src/**/*.ts"
---

# Contexts

The tree is organised by bounded context, never by layer, so a change to one concern opens
one directory instead of three. Three invariants make that hold, and `tests/architecture/`
enforces each of them mechanically.

## 1. The chain

Which context may import which is data, not prose. `tests/architecture/helpers.ts` declares
`ALLOWED`, the edges the chain permits, and `BASELINE`, the edges the tree still has with the
count and file count each one admits. Read the edges there and nowhere else: this file states
the invariant behind them, it does not carry a second copy that could disagree.

Two rules read that one declaration. `context-graph.arch.test.ts` fails the build on any edge
`ALLOWED` does not name, and holds each baselined edge to its recorded weight so an admitted
edge cannot absorb new imports in silence. `biome-context-parity.arch.test.ts` checks
`biome.json`'s per-context `noRestrictedImports` overrides against the same data, because
biome answering to its own memory is how a rule kept naming paths the refactor had deleted.

The invariant itself: arrows run one way, down toward the kernel. `presentation` and `runtime`
may depend on any context; a context depending on either is a `BASELINE` entry, and that list
may only shrink.

## 2. The kernel

`kernel/` imports no context and carries no business logic. It is shared vocabulary: types,
pure helpers, typed errors, and the ports two or more contexts both need. A port used by
exactly one context belongs to that context, not here. If a kernel module needs a domain
decision to be correct, it is not kernel material: move the decision to whichever context
makes it, and keep the kernel a place with nothing to get wrong. Biome refuses the import
outright, since `src/kernel/**` may reach no context layer, no `presentation` and no
`runtime`.

This is also what keeps a forbidden edge structurally impossible rather than merely absent.
Measurement asks a tool what it declares, and a tool declares nothing about measurement: the
vocabulary both speak lives in `kernel/measurement.ts`, so the reverse edge has nothing to
import.

## 3. No reach into a context's interior

An import from outside a context may only target a module that context declares public. There
is no barrel to hold that boundary (`.claude/rules/01-standards/1-conventions.md`), so the
boundary is a list: `PUBLIC_MODULES` in `tests/architecture/context-boundary.arch.test.ts`
names every module each context exposes. A module a caller outside the context needs is
invisible until it is added there, and everything else is internal whether or not anything
currently reaches for it.

A context never leaves itself to come back in either. An import that climbs above
`src/contexts/<X>/` and spells `<X>` out again lands where a shorter specifier already
reached, and `context-self-reentry.arch.test.ts` carries that as a shrinking baseline.

## Adding something

- Decide which context owns the concept before writing anything. A use case that fits nowhere
  means the contexts are wrong, not that a landing zone is missing.
- A cross-context call goes through a public module of the target context, in the direction
  the chain allows. Wrong direction means the caller sits in the wrong context, not that the
  callee is missing an export.
- These rules carry no paths on purpose. Where a file goes is
  `aidd_docs/memory/codebase-map.md`, held to the tree in both directions by
  `codebase-map.arch.test.ts`.
