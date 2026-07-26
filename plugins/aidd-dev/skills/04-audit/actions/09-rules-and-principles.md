# 09 - Rules and principles

Evaluate every active rule against current code and maintained project state. Read-only.

## Input

Active host instructions, scoped repository rules, user-supplied principles, and their resolved precedence.

## Output

`03-rules.md`, following `../assets/audit-template.md` with a `## Rule control matrix`.

| Control ID | Rule | Source | Scope | Precedence | Letter | Spirit | Status | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RULE-C001` | Short normative statement | `path:line` | Evaluated surface | Resolved priority | pass / partial / fail / unknown / disputed | pass / partial / fail / unknown / disputed | Overall status | Implementation references |

## Questions

- Which active rule is violated by code, configuration, tests, or maintained memory?
- Which rule is followed literally but violated in spirit?
- Which rules conflict, are impossible to evaluate, or have ambiguous scope?
- Which repeated violation should become executable enforcement?

## Process

1. Read the audit contract, question protocol, and Rules pack.
2. Inventory every active rule with source, scope, precedence, and a stable control ID.
3. Mark each `pass`, `partial`, `fail`, `unknown`, or `disputed`, citing implementation evidence.
4. Group repeated violations of one rule into one root finding, but keep every violating location linked in the control matrix.
5. Report every active rule in the matrix. The five-finding cap does not hide material rule failures; prioritise the five root causes in the Findings section and link remaining failed controls.
6. Suggest automation when a rule can be enforced more reliably by type, lint, test, CI, hook, or skill.
