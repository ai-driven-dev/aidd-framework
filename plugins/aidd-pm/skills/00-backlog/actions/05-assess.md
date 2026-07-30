# 05 - Assess

Challenge refinement from product, delivery, and quality viewpoints.

## Input

The proposed change set and its affected Epic or Story snapshots.

## Output

Three independent assessments and one reconciled verdict per target.

## Process

1. **Snapshot.** Capture each affected target and its evidence once.
2. **Spawn.** For one target at a time, run `product-advocate`, `delivery-advocate`, and `quality-advocate` in parallel with the same snapshot.
3. **Reconcile.** Use Three Amigos to preserve consensus, divergences, questions, and `ready`, `revise`, or `blocked`.

## Test

| Case | Pass |
| --- | --- |
| Inputs | all reviewers for one target receive the same snapshot |
| Isolation | reviewers neither write nor delegate |
| Disagreement | divergent findings remain explicit |
| Result | exactly three role results and one justified verdict per target |
