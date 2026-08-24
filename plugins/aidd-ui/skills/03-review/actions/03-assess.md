# 03 - Assess

Diagnose feature experience defects and prioritize all owned findings.

## Input

The evidence inventory and specialist fragments.

## Output

A coverage result and findings ordered `blocker`, `important`, then `minor`.

## Process

1. **Evaluate.** Compare observable task behavior with requirements, the UI contract, and pinned system decisions.
   - Check whether task priority, information order, control affordance, feedback, and required states remain true.
   - Assess applicable interface copy, hierarchy, visual emphasis, density, alignment, and motion only against explicit evidence.
2. **Exclude.** Accept accessibility and adaptation findings only from their specialists.
3. **Prioritize.** Assign overall priority using [findings.md](../references/findings.md) without altering specialist verdicts.
4. **Bound.** State required behavior and owner without adding implementation steps.
   - Preserve specialist fields unchanged.
5. **Report.** Keep evidence gaps separate from findings.

## Test

| Case | Pass |
| --- | --- |
| Feature finding | it includes evidence, impact, outcome, owner, and priority |
| Specialist finding | its content and provenance are unchanged |
| Aesthetic preference | it is absent without requirement or system evidence |
| Expression defect | the violated copy, hierarchy, feedback, or motion decision is cited |
| Technical issue | it appears only through an observable experience consequence |
