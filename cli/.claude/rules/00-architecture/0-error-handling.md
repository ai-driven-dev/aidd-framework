---
description: Apply when handling a failure; a typed exception travels inward and is caught once, at the command edge.
paths:
  - "src/**/*.ts"
---

# Errors

## Flow

- A use case throws.
- It never catches its own errors.
- It never returns a failure as a value.
- An adapter catches only to type an I/O error (`kernel/errors.ts`).
- Never `catch {}` into a default: unreadable is not absent.
- An empty catch is a listed best effort or a failure (`catches-that-swallow.arch.test.ts`).
- The command layer is the only catcher: `errorHandler.handle(error)`, exit 1.
- The update-check hook is the one deliberate swallow.

## Catalog

- `kernel/errors.ts` is the one catalog.
- Every class in it is thrown (`errors-that-are-thrown.arch.test.ts`, empty baseline).

## Instructing

- A message naming a command is a contract.
- `errors-that-instruct.arch.test.ts` checks each named command against the CLI.
- Descriptive prose is not pinned.
