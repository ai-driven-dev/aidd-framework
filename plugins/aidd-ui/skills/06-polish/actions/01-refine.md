# 01 - Refine

Define the smallest refinements that improve expression without changing the experience structure.

## Input

A settled interface proposal or existing interface with its confirmed system conventions.

## Output

A prioritized polish delta covering only applicable hierarchy, spacing, typography, alignment, rhythm, feedback, motion, state consistency, noise, copy density, and affordance, a no-refinement result, or a structural-blocker report.

## Process

1. **Confirm.** Verify that intent, structure, core behavior, responsive rules, and accessibility requirements are settled enough to polish.
   - A structural defect blocks meaningful polish: report it and stop without redesigning.
2. **Inspect.** Compare the interface with confirmed tokens, components, state patterns, and repeated page conventions.
3. **Refine.** State each bounded change with evidence, expected experience effect, and preserved structure.
   - No evidence supports a change: state that no refinement is needed.
4. **Express.** Keep every change at the experience-decision level, with no source code, component markup, CSS declarations, or framework recipe.
5. **Order.** Prioritize clarity and consistency before decorative expression.

## Test

| Case | Pass |
| --- | --- |
| Refinement proposed | it cites a requirement, observed defect, or confirmed convention |
| Structural change required | the run stops and names the blocker without redesigning |
| Motion proposed | feedback purpose and reduced-motion behavior are explicit |
| No refinement evidenced | the result says none is needed and invents no preference |
| Refinement expressed | it contains no implementation code or CSS declaration |
| Final output | hierarchy and task flow remain unchanged and source files read back unchanged |
