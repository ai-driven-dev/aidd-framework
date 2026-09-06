---
paths:
  - "src/presentation/commands/**/*.ts"
  - "src/cli.ts"
  - "src/runtime/wiring/**/*.ts"
---

# Dependency Wiring

Every dependency is constructed in one place, so a command file wires nothing and a use case
never reaches for a collaborator it was not handed.

## Two factories

- `createDeps(projectRoot, options, output)` builds the full graph. It is called from a command
  action, never before `program.parse()`.
- `createMenuDeps(projectRoot)` builds the two dependencies the interactive menu needs before
  parsing, a `ManifestRepository` and a `Prompter`. When a pre-parse need grows, extend that
  factory instead of instantiating an adapter in `cli.ts`.
- One wiring module per context under `runtime/wiring/`, composed by
  `runtime/wiring/framework.ts`, the composition root.

`cli.ts` constructs exactly two things itself: the version reader it needs before any graph
exists, and the `CLIOutput` it hands to the factory. Anything else instantiated there is a
dependency that escaped the graph.

## Built once per project root

`createDeps` memoizes on `projectRoot`, and the `preAction` hook warms that cache for
`process.cwd()` before any action runs, unless `AIDD_SKIP_UPDATE_CHECK` short-circuits the hook
first. A command therefore pays for no second construction and needs no cache of its own: a
second cache layer in a command file would key on something the first one already answers.

## Not an area

The composition root is exempt from the sharing rule by construction (`0-shared-modules.md`):
it wires everything, so counting it as a calling area would let any module qualify as shared
for free.
