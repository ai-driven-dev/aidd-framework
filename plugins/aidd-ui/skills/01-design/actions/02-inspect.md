# 02 - Inspect

Map the current interface evidence in the relevant project area.

## Input

The interface frame from `01-frame` and the project root.

## Output

An evidence map of relevant screens, patterns, primitives, tokens, layout rules, states, accessibility conventions, responsive conventions, and memory drift.

## Process

1. **Scope.** Select the relevant workspace before reading a monorepo's root configuration.
2. **Read.** Inspect project memory and repository evidence in the order defined by [evidence.md](../references/evidence.md).
3. **Compare.** Report each memory contradiction and keep repository evidence as current reality.
   - The project has no interface evidence and the request does not explicitly create an interface: return that boundary instead of inventing one.

## Test

| Case | Pass |
| --- | --- |
| Existing system | every named convention includes a repository source path |
| Matching memory | the evidence map confirms it against implementation evidence |
| Stale memory | the contradiction is reported and no memory file changes |
| Monorepo | evidence comes from the affected workspace, not only the root manifest |
| Backend-only project | no interface system is inferred without an explicit creation request |
