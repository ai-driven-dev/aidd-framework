# 08 - North Star

Audit whether current code serves the user-confirmed product intent and critical outcomes. Read-only.

## Input

Explicit North Star sources, or candidates discovered in the current repository.

## Output

`02-north-star.md`, following `../assets/audit-template.md`.

## Questions

- Which critical outcome does the implementation serve differently from the North Star?
- Which shipped behavior contradicts, obscures, or omits a primary outcome?
- Which technical choice optimises a local concern at the expense of product intent?
- Where can the application appear successful while failing the intended outcome?

## Process

1. Read the audit contract, question protocol, and North Star pack.
2. Resolve explicit sources first. Otherwise discover candidates, show ambiguity, and never silently canonise one.
3. If no current North Star resolves, write the chapter as `skipped` and continue other pillars.
4. Extract only material outcomes and constraints, not every sentence.
5. Trace them into routes, commands, schemas, public APIs, and critical code paths.
6. Report at most five verified divergences.

## Test

- Every finding cites both a confirmed North Star statement and implementation evidence.
- Missing or conflicting sources produce skipped, unknown, or disputed status rather than invented intent.
- Old plans are ignored unless explicitly declared normative.
- `02-north-star.md` contains no cosmetic product suggestions.
