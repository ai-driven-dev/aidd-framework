---
id: {system-id}
revision: {positive integer}
status: {active | retired}
scope:
  - {normalized project-relative UI root}
sources:
  - {canonical implementation path}
supersedes: {system-id@revision or null}
---

<!-- Fill applicable sections, then remove this comment, every brace, and every empty optional section. -->

# UI System: {name}

## Intent

{What this shared system enables and the products or workspaces it serves.}

## Foundations

| Decision | Contract | Evidence |
| --- | --- | --- |
| {color, type, spacing, shape, depth, or motion foundation} | {accepted rule} | {canonical source path} |

## Surfaces

| Pattern, component, or token | Contract | States | Source |
| --- | --- | --- | --- |
| {shared surface} | {when and how it is used} | {applicable states} | {canonical source path} |

## Adaptation

| Provider | Target and scope | Evidence | Required transformation | Acceptance |
| --- | --- | --- | --- | --- |
| {provider provenance} | {space, input, or platform target} | {source} | {shared behavior} | {observable condition} |

## Accessibility

| Provider | Target and scope | Evidence | Required behavior | Acceptance |
| --- | --- | --- | --- | --- |
| {provider provenance} | {shared interaction} | {source} | {accessible behavior} | {observable condition} |

## Assets

| Asset family | Role | Canonical source |
| --- | --- | --- |
| {icons, imagery, type, or other asset} | {accepted use} | {project path} |

## Deprecations

| Surface | Replacement | Removal condition |
| --- | --- | --- |
| {deprecated convention} | {accepted replacement} | {condition} |
