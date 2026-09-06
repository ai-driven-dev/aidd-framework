---
paths:
  - "src/contexts/**/*.ts"
---

# Shared Modules

A module earns a place in a `shared/` directory by having callers in at least two areas. One
caller means it belongs to that caller: move it down rather than promoting it, and never create
the directory in anticipation of a second caller that has not been written.

- An area is a context's `application/<subdirectory>/`, the context's own application root, or
  one of the legacy top-level areas that predate the context refactor. Two use cases in one
  context count as two areas only when they sit in different subdirectories.
- The composition root (`runtime/wiring/`) is never an area. It constructs everything, so
  counting it would let any module satisfy this rule by being wired rather than by being needed
  twice.
- Count before promoting: `grep -rl <module> src`. `earned-sharing.arch.test.ts` runs the same
  count mechanically, with an empty baseline, over files sitting directly inside a `shared/`
  directory. A file nested one level deeper is a private step of one shared module and is not
  judged by it.
- A promoted module follows the use case rules of `0-hexagonal.md`.

Crossing a context boundary is a stricter and separate question. A module reached from outside
its own context must be declared public there (`0-contexts.md`), and one with real callers in
two contexts belongs in `kernel/` only once it has stopped being business logic. Most
cross-context sharing stays in the owning context's public surface instead.
