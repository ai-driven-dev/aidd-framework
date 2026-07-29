# 01 - Build

Draft a fresh spec from a free-form request, or by lifting fields from an existing PRD.

## Input

A free-form request, or a path to an existing PRD. A feature name for the folder, derived from the request when absent.

## Output

The path to `spec.md` in the feature folder, drafted from the template, with the ambiguities and assumptions noted.

## Process

1. **Source.** From a PRD path, lift its target, hard constraints, non-goals, and done-when into the template, dropping any implementation detail. From a request, map it onto the template sections directly. Do not explore the codebase.
2. **Gaps.** Replace any missing required field with `TBD: <precise question>`. Never guess.
3. **Check.** Confirm every section the validator requires is present. Omit an optional section (stakeholders, context) that has nothing to say rather than emit a placeholder.
4. **Write.** Resolve the feature folder, reusing it when it exists, and save the spec there as `spec.md`.
5. **Return.** Surface the spec path and the notes.

## Test

- `spec.md` exists in the feature folder.
- It contains every section the validator marks required in `@../assets/spec-validator.yml`.
- It carries no library name, framework pattern, or source-file layout.
