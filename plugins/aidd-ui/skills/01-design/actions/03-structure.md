# 03 - Structure

Define the information and interaction structure before visual treatment.

## Input

The interface frame and evidence map.

## Output

A screen and state structure naming regions, information order, primary and secondary actions, component responsibilities, and transitions.

## Process

1. **Order.** Arrange information and actions around the user's task and stated constraints.
2. **Assign.** Give each region and component one clear responsibility.
3. **Model.** Include only applicable default, loading, empty, error, disabled, success, and destructive states.
4. **Exclude.** Keep unstated devices, input methods, content fields, and workflows as open risks rather than structural decisions.
5. **Sketch.** Add a low-fidelity representation only when spatial relationships remain ambiguous.

## Test

| Case | Pass |
| --- | --- |
| Structure produced | every region and action traces to the frame or evidence map |
| State included | its trigger and observable outcome are named |
| Context unstated | no region or interaction depends on an invented value |
| Low-fidelity view included | it contains structure only, with no arbitrary styling or final copy |
