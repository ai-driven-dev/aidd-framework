# 01 - Frame

Isolate the feature intent without recreating product requirements.

## Input

The user's request or requirements artifact, plus `create` or `revise` mode.

## Output

A compact frame naming the contract target, objective, user task, platform, affected surfaces, constraints, sources, and material unknowns.

## Process

1. **Locate.** Reuse the supplied artifact folder or create `aidd_docs/tasks/<yyyy_mm>/<yyyy_mm_dd>_<feature-slug>/`.
2. **Extract.** Keep only facts that constrain the interface experience and retain their sources.
3. **Classify.** Use `create` without a contract and `revise` against an identified revision.
   - For one material experience unknown, ask one focused question and stop.
   - Keep other unknowns explicit.

## Test

| Case | Pass |
| --- | --- |
| Existing requirements | each frame fact is sourced or explicitly derived |
| Revise mode | the existing contract id and revision are named |
| Missing essential fact | design decisions wait for one focused question |
| Complete frame | it contains no new product requirement or implementation choice |
