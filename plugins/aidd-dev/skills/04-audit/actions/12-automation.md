# 12 - Automation and knowledge infrastructure

Turn recurring audit findings and tacit knowledge into proportionate permanent guardrails. Read-only.

## Input

Confirmed findings from other pillars, active automation, rules, skills, memory, CI, and repository tooling.

## Output

`10-automation-and-knowledge-infrastructure.md`, following `../assets/audit-template.md` with `## Automation candidates`.

| Candidate ID | Finding | Recurrence | Current cost | Enforcement layer | Leverage | False-positive risk | Maintenance cost | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `AUTO-C001` | Canonical finding ID | Evidenced recurrence | Human, agent, or CI cost | Type, lint, test, CI, context, or runtime | Expected class-level benefit | high / medium / low | high / medium / low | Responsible role |

## Questions

- Which issue class already consumes repeated human or agent reasoning?
- Which review rejection indicates missing repository knowledge?
- Could a fresh agent make the right choice with zero extra prompt?
- Which invariant belongs in executable enforcement rather than prose?
- Which guardrail has the best leverage after false-positive and maintenance cost?

## Process

1. Read the audit contract, question protocol, and Automation pack.
2. Start from confirmed findings and repeated patterns; do not invent automation for hypothetical preferences.
3. Map each candidate to the strongest proportionate layer: type/schema, lint/static analysis, test, CI, rule/skill/memory/docs, or runtime assertion/telemetry.
4. Record recurrence, current human or token cost, proposed layer, expected leverage, false-positive risk, maintenance cost, and owner.
5. Prefer one class-level guardrail over multiple one-off fixes.
6. Rank at most five automation candidates.
