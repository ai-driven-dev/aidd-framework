# 06 - Decide

Reconcile proposed changes and confirm their authority.

## Input

The change set and any refinement findings.

## Output

An authorized change set, requested revisions, or no change.

## Process

1. **Reconcile.** Merge duplicate proposals and surface contradictions.
2. **Impact.** Show every artifact, field, transition, relation, and reason that would change.
3. **Authorize.** Apply bounded autonomous authority, or ask one open question for correction, rejection, or approval and wait for the reply before the change set is frozen.
4. **Freeze.** Allow no unlisted mutation.

## Test

| Case | Pass |
| --- | --- |
| Conflict | contradiction shown; no approval inferred |
| Partial approval | unapproved entries removed from the change set |
| Interactive approval | every mutation has identity, owner, before, after, and evidence |
| Bounded autonomy | only pre-authorized mutations remain |
| No authority | workspace unchanged |
| Open question | apply does not start before the reply arrives |
