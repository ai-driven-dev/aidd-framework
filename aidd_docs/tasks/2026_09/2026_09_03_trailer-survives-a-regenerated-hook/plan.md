---
status: planned
backlog: ai-driven-dev/framework#746
spec: ./spec.md
---

# Plan

## The one duplication this creates, and how it is guarded

The hook must write the same line the CLI writes. The CLI owns it in TypeScript
(`sessionTrailerHookLine`, `commit-session-trailer.ts`); the hook is zero-dependency
CommonJS and cannot import it. So the literal exists twice.

That is the shape this branch already had once, and its fix is the precedent to follow: the
`unrecognised_payload` marker is written by the hook in CJS and read by the CLI in
TypeScript, and it is *"guarded by a case that spawns the real hook and reads whatever file
it writes"* — not by two fixtures typing the same string. The trailer line gets the same
guard: spawn the hook, read the `prepare-commit-msg` it repaired, and compare against what
the CLI's own function produces.

## Phases

| # | Does | Touches |
| --- | --- | --- |
| 1 | The hooks directory joins the one `rev-parse` already spent, and a failure there costs only itself | `hooks/lib/repo.cjs` |
| 2 | The repair: delegate present, call site missing, append it back | `hooks/lib/trailer-repair.cjs` (new) |
| 3 | Wired on `session-start` only, beside the precedent that draws that line | `hooks/lib/record.cjs` — the only place already holding an *enabled* repository's hooks directory |
| 4 | `check` states the five claims, the last a count of commits actually carrying the trailer | `cli/src/**` |
| 5 | Tests: the repair by shape not by brand, and the cross-language line guard | `scripts/__tests__/`, `cli/tests/` |
| 6 | The skill relays the new claims | `plugins/aidd-telemetry/skills/02-check/` |

## Test strategy

- **Hook, `scripts/__tests__`** — a real `git init`, a real `prepare-commit-msg`, overwritten
  the way a regeneration would; spawn `journal.cjs session-start`; assert the line is back.
  Then the cases that must **not** repair: no delegate, and `tool-used`.
- **Cross-language** — the repaired file contains exactly what `sessionTrailerHookLine`
  produces, read from the CLI rather than retyped.
- **CLI** — the five claims, each with its own reading, including a registry of commits where
  none carries a trailer versus one where some do.
- **End to end** — attempted and dropped, with the reason recorded rather than the promise
  quietly unkept: driving the hook from inside a vitest worker hangs, because this payload
  names a real host so the hook spawns `git` of its own, and a synchronous child spawning a
  synchronous child in a worker thread does not return. The same call runs fine on the main
  thread. The property that e2e was for — that both spellings of the call site agree — is
  taken at the module seam instead, which is cheaper and proven to bite.

## What will not be built

Nothing that names lefthook or husky. The repair asks only whether the call site is there,
never why it went, which is what lets one path cover every cause.
