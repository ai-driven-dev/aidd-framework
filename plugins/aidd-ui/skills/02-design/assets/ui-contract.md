---
id: {feature-id}
revision: {positive integer}
status: {draft | ready}
systems:
  - id: {system-id}
    revision: {positive integer}
required_deltas:
  - {project-relative system-delta path}
supersedes: {prior contract id and revision or null}
---

<!-- Fill applicable sections. Remove all comments, braces, and empty optional sections. `systems: []` is valid when no shared system decision applies or while an approved or verified establishment delta has no current matching id or equal or unorderable active scope overlap. -->

# UI Contract: {feature}

## Intent

- User: {target user}
- Task: {primary task}
- Outcome: {observable outcome}

## User Flow

{ordered interaction flow}

## Screens

| Screen or region | Responsibility | Primary action |
| --- | --- | --- |
| {name} | {one responsibility} | {action} |

## System Reuse

| Surface | System revision | Source | Use |
| --- | --- | --- | --- |
| {pattern, composite, primitive, token, or layout} | {system-id@revision} | {project path} | {role} |

## Interaction States

| State | Trigger | Feedback | Recovery or next action |
| --- | --- | --- | --- |
| {state} | {trigger} | {observable feedback} | {recovery or next action} |

## Assets

| Role | Source or requirement | Constraints | Acceptance |
| --- | --- | --- | --- |
| {feature-local visual role} | {existing source path or required asset} | {content, crop, format, or behavior constraint} | {observable condition} |

## Adaptation

| Provider | Target and scope | Evidence | Required behavior | Acceptance | System impact |
| --- | --- | --- | --- | --- | --- |
| {provider} | {target and scope} | {evidence} | {behavior} | {condition} | {impact or none} |

## Accessibility

| Provider | Target and scope | Evidence | Required behavior | Acceptance | System impact |
| --- | --- | --- | --- | --- | --- |
| {provider} | {target and scope} | {evidence} | {behavior} | {condition} | {impact or none} |

## UI Decisions

| Decision | Evidence | Consequence | Rejected alternative |
| --- | --- | --- | --- |
| {feature choice} | {requirement or convention} | {constraint to preserve} | {optional alternative and reason} |

## Interface Expression

| Decision | Evidence | Acceptance |
| --- | --- | --- |
| {applicable copy, hierarchy, emphasis, density, alignment, feedback, or motion decision} | {requirement or system evidence} | {observable condition} |

## Implementation Constraints

- {experience constraint without implementation code}

## Unresolved

- {missing decision and why it blocks readiness}
