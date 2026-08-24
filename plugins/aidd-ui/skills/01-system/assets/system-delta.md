---
id: {delta-id}
system: {system-id}
base_revision: {positive integer or null}
mode: {establish | extend | retire}
status: {draft | approved | verified | promoted | rejected | superseded}
approval_source: {user confirmation, orchestrator mandate, or null}
verification_commit: {commit id or null}
target_scope:
  - {normalized project-relative UI root}
expected_sources:
  - {planned canonical implementation path}
verified_sources:
  - {implemented canonical path or empty until verified}
---

<!-- Fill applicable sections. Remove this comment, every brace, and empty optional sections. -->

# UI System Delta: {title}

## Need

{Explicit requirement and why the active system cannot already satisfy it.}

## Reuse

| Existing surface | Source | Role |
| --- | --- | --- |
| {pattern, component, token, or convention} | {project path} | {how it is reused} |

## Change

| Decision | Evidence | Consequence | Rejected alternative |
| --- | --- | --- | --- |
| {smallest shared change} | {requirement or implementation evidence} | {contract effect} | {optional rejected parallel convention} |

## States

| State or context | Required behavior | Acceptance |
| --- | --- | --- |
| {shared component or pattern state} | {behavior} | {observable condition} |

## Specialist Fragments

| Provider | Concern and scope | Evidence | Required behavior | Acceptance | System impact |
| --- | --- | --- | --- | --- | --- |
| {provider} | {accessibility or adaptation target and scope} | {evidence} | {behavior} | {condition} | {impact or none} |

## Dependencies

- {dependent UI contract, implementation source, or replacement system}

## Implementation Constraints

- {constraint without component code or CSS}

## Verification

- {evidence required before promotion}

## Unresolved

- {decision that keeps the delta draft}
