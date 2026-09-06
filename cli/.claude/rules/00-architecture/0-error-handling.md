---
paths:
  - "src/**/*.ts"
---

# Errors

A failure travels as a typed exception and is caught once, at the edge. Nothing is swallowed,
so no failure can reach a user disguised as an answer.

- A use case throws. It does not catch its own errors, and it does not return a failure as a
  value.
- An adapter catches only to convert: a third-party or I/O error becomes a typed exception from
  `kernel/errors.ts` before it leaves the adapter. A bare `catch {}` returning a default is the
  shape to refuse, because it turns an unreadable file into an absent one and the caller cannot
  tell the difference.
- The command layer is the only catcher. `errorHandler.handle(error)` in the action's catch
  prints the message and exits 1.
- The update-check hook is the single deliberate exception. It swallows on purpose: it must
  never fail the command a person actually asked for.

## The catalog

`kernel/errors.ts` is one catalog for the whole codebase, which is what makes it easy to read
and easy to rot. Every class it declares is thrown by production code:
`errors-that-are-thrown.arch.test.ts` keeps that baseline empty, because knip counts a class
its own test imports as used and cannot see the rot.

## A message that instructs

A message telling a user what to run is a contract, and the cost of it being wrong is somebody
typing a command that does not exist. `errors-that-instruct.arch.test.ts` reads every string
and template literal under `presentation/` and under each context's `application/` layer, and
checks each command it names against the ones the CLI declares. A message that only describes
what happened is prose, and is deliberately not pinned: asserting prose gives tests that break
on a reword and protect nothing.
