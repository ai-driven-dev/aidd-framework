# 04 - Structure

Define feature information and interaction structure before visual treatment.

## Input

The frame, evidence map, and specialist fragments.

## Output

A feature structure naming screens, regions, information order, actions, responsibilities, transitions, and applicable states.

## Process

1. **Order.** Arrange information and actions around the stated user task.
2. **Assign.** Give each feature region one responsibility.
3. **Model.** Include only applicable default, loading, empty, error, disabled, success, destructive, permission, offline, timeout, localization, and extreme-content states.
4. **Preserve.** Apply specialist required behavior without changing its verdict.
5. **Represent.** Select the minimum structural representation.
   - When spatial relationships remain ambiguous, add a low-fidelity view.

## Test

| Case | Pass |
| --- | --- |
| Region or action | it traces to the frame, system, or evidence map |
| State included | its trigger and observable outcome are named |
| Specialist behavior | it appears without reinterpretation |
| Low-fidelity view | it contains structure, not arbitrary styling or final copy |
