# 03 - Write

Write the skill tree from the plan.

## Input

- The plan from 02.
- The target from 01, or for a modify the existing skill's own location.

## Output

The skill tree at the target, and the list of files written.

## Process

1. **Tree.** Create the shape in [skill-tree.md](../references/skill-tree.md).
2. **Router.** Fill [skill-template.md](../assets/skill-template.md) against [skill-authoring.md](../references/skill-authoring.md), strip the scaffold.
   - Modify: revise the existing SKILL.md in place, keeping the user's edits.
3. **Actions.** Fill [action-template.md](../assets/action-template.md) per row against [skill-authoring.md](../references/skill-authoring.md), its test copied from the plan.
   - Modify: revise a changed action in place. Leave an untouched one alone.
4. **Hint.** Set `argument-hint` per [skill-authoring.md](../references/skill-authoring.md).
5. **Place.** Write once per confirmed target, using [tool-write.md](../references/tool-write.md).
6. **Check.** Confirm every written path is relative, inside the workspace, outside the plugin install directory, and under the chosen target. Else stop and report it.

## Test

| Case | Pass |
| --- | --- |
| The router is written | it holds a `mermaid` flowchart and an `Action \| Does` table |
| The action table is read back | every slug is bare and every `Does` is a lowercase imperative with no final period |
| An action file is written | it holds `## Output`, `## Process`, and a `Case \| Pass` `## Test` |
| The tree is written | its shape matches [skill-tree.md](../references/skill-tree.md) |
| Any written file is read back | no `<` placeholder and no template instruction line survives |
| A path resolves outside the chosen target | the run stops and reports that path |
