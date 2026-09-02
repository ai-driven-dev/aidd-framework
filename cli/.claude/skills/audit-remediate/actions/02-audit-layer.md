# 02 - Audit Layer

Enumerate all violations in the target layer by applying the layer skill's transversal rules
and invariant checks to every file. Produces a named violation list; does not touch any file.

## Inputs

- `target-layer-path` (required) - directory to audit
- `layer-skill` (required) - the authoritative layer skill (read its transversal rules)

## Outputs

A violation list. Each entry:
- File path (relative to project root)
- Violation type (from the layer skill's transversal rules)
- Description of the violation
- Proposed fix approach (how the layer skill resolves it)

## Process

1. Read the layer skill's SKILL.md. Extract its transversal rules and invariant rules sections.
2. For each file in `target-layer-path`:
   a. Check each transversal rule against the file's content.
   b. Record any violation with its file path, rule violated, and fix approach.
3. Produce a numbered violation list. If the list is empty, record a confirmed-clean verdict:
   "02 complete — layer \<path\> audited clean by \<layer-skill\>. No violations found."
4. Do not edit any file in this action.

## Common check categories

Consult the target context skill for the definitive list. Typical checks by area:

- `tools` (a format, capability, or profile): named export only, no `any`, `.js` ESM imports; a
  format is a pure function with a lossless round-trip inverse; a capability class ends in
  `Capability`, takes one params object, all public fields `readonly`, throws
  `CapabilityConfigError` on invalid params; a profile carries the `AiTool<C>` type annotation,
  a non-null `signalDir`, lossless `rewriteContent`/`reverseRewriteContent`, and calls
  `registerTool` at file bottom.
- `translate`/`distribution`/`framework` use-cases: class ends in `UseCase`, single
  `async execute()`, no self-caught errors outside the three documented carve-outs, typed
  `*Options`/`*Result`, `.js` imports, no `any` — see `.claude/rules/00-architecture/0-use-case.md`.
- A port/adapter pair in any context's `infrastructure/`: port is an interface only (≤5 methods,
  no unexplained `null`), adapter owns every technical constant and translates raw errors to
  `kernel/errors.ts` types — see `.claude/rules/00-architecture/0-ports-adapters.md`.

## Test

The violation list is complete when every file in `target-layer-path` has been evaluated
against every transversal rule in the layer skill. Confirm file count matches `ls` output.
