# 01 - Frame

Isolate the interface intent without recreating product requirements.

## Input

The user's request or an existing requirements artifact.

## Output

A compact frame naming the objective, user and task, platform, affected screens, constraints, and confirmed unknowns.

## Process

1. **Read.** Use the supplied requirements as written and keep their source location.
2. **Extract.** Keep only facts that constrain the interface experience.
3. **Resolve.** Complete the frame from confirmed facts.
   - An unanswered fact would materially change the experience: ask one question, then frame again.
   - A non-blocking platform, input, device, or content fact is unstated: keep it unknown and never design from an assumption.

## Test

| Case | Pass |
| --- | --- |
| Existing requirements | each frame fact is present in or explicitly derived from the source |
| Missing essential fact | one focused question is asked before design decisions begin |
| Complete frame | it contains no new product requirement or implementation choice |
| Non-blocking unknown | it remains explicit and no downstream decision relies on an assumed value |
