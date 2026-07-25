# 11 - Decisions

Interrogate material implementation choices, uncertainty, generality, and reversibility. This action composes with `02-architecture`. Read-only.

## Input

Decision logs when present, North Stars, active rules, current architecture sources, code, and limited history needed to establish a choice.

## Output

The `## Decision register` and decision-related findings in `05-architecture-and-decisions.md`.

| Decision ID | Choice | Provenance | Confidence | Alternatives | Assumptions | Generality | Reversibility | Evidence | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `DEC-001` | Material choice | specified / agent-made / retrospectively-inferred | high / medium / low | Credible alternatives | Required assumptions | general / local / unknown | easy / moderate / hard | References | pass / finding / unknown / disputed |

## Questions

- Which choices were specified, explicitly agent-made, or retrospectively inferred?
- Which choices were made because the task was underspecified?
- Which choice are you least confident in, and what evidence would change it?
- Which decision fixes the observed example but not the class?
- Which decision is expensive to reverse or broad in reach?

## Process

1. Read the audit contract, question protocol, and Architecture and decisions pack.
2. Prefer implementation-time decision logs. Otherwise reconstruct only material choices and label them `retrospectively-inferred`.
3. Record provenance, confidence, alternatives, assumptions, scope, generality, reversibility, affected surfaces, and evidence.
4. Apply the generality gate to constants, thresholds, buffers, special cases, and narrowly placed fixes.
5. Use decision risk to focus code inspection; never let a declared decision suppress contradictory evidence.
6. Feed verified decision findings into the shared architecture chapter.

## Test

- Retrospective inference is never presented as original intent.
- Every non-general finding proves the class remains unresolved beyond the observed example.
- High-confidence declarations cannot override contradictory code evidence.
- The decision register contains no hidden chain-of-thought.
