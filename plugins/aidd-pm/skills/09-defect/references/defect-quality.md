# Defect Quality

A Defect records observed product behavior that conflicts with expected behavior.

## Qualification

| Input | Result |
| --- | --- |
| observed mismatch | Defect |
| desired new behavior | User Story |
| bounded design or feasibility unknown | Spike |
| active service disruption | incident-response capability |
| bounded resolution work | Task linked to the Defect |
| same mismatch and context | existing Defect |

## Readiness

| Criterion | Ready when |
| --- | --- |
| Mismatch | expected and actual behavior differ explicitly |
| Impact | affected users, workflow, or outcome is bounded |
| Evidence | a stable report, observation, log, or reproduction supports the mismatch |
| Scope | environment and known boundaries are explicit when relevant |
| Relations | source, dependencies, and affected artifacts are linked or absent |
| Resolution | a future verification can prove the mismatch is gone |

A Defect may remain `reported` while evidence is incomplete. Order follows product impact and project policy, not severity alone.
