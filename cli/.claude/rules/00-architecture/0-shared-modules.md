---
paths:
  - "src/contexts/**/*.ts"
---

# Shared Modules

When a module earns the right to live in a `shared/` directory.
`tests/architecture/earned-sharing.arch.test.ts` enforces this only for files sitting directly
inside a `shared/` directory — a file nested one level deeper (a private step of one shared
module) is not judged by it. A "calling area" is a context's `application/<subdirectory>/`, the
context's own application root, or a handful of legacy top-level areas (`commands`, `prompts`,
`domain`, `infrastructure`, `runtime`) that predate this refactor — the composition root
(`runtime/wiring/`) never counts, since it wires everything by construction and would let any
module satisfy the rule for free.

- Sharing needs callers in ≥2 areas — two use-cases inside one context is enough; it does not
  require two different contexts
- One caller means move it down, into whichever single caller needs it — do not create the
  `shared/` directory in anticipation of a second caller
- Count callers before promoting: `grep -rl <module> src` (the test is mechanical, run the same check)
- Promoted modules follow use-case rules
- Crossing a context boundary is a stricter, separate question from this rule: a module reached
  from outside its own context must be declared public there
  (`context-boundary.arch.test.ts`), and a module with real callers in ≥2 contexts belongs in
  `kernel/` only if it has stopped being business logic (`0-contexts.md`, invariant 2) — most
  cross-context sharing stays in the owning context's public surface instead.
