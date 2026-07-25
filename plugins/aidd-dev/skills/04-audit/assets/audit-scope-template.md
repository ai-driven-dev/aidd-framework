---
audit: scope-slug
chapter: 01-scope-and-system-map
status: complete
owner: current-context
last_verified: yyyy-mm-dd
sources:
  - current-repository
depends_on:
  - none
---

# 01 - Scope and system map

## Target

- **Repository**: Resolved target
- **Scope**: Included application surfaces
- **Profile**: core or named pillar

## Normative sources

| Kind | Resolved source | Status | Precedence |
| --- | --- | --- | --- |
| North Star | path or none | confirmed, ambiguous, or absent | explicit or unresolved |
| Rules | paths or active host context | confirmed | resolved scope |
| Memory | path or none | present or absent | non-normative knowledge |
| Architecture | paths or none | current, ambiguous, or absent | explicit or unresolved |

## Exclusions

- Historical tasks, old plans, past reviews, generated output, vendored dependencies, general dependency inventory, and other excluded surfaces.

## Budget

- Pillars, finding cap, stop boundary, available tools, and inaccessible evidence.

## Runtime policy

- Static-first
- Runtime escalation reason or `none`

## Independence

- `none`, `parallel-shards`, or `parallel-shards-plus-fresh-challenge`

## System map

Concise modules, boundaries, critical paths, and data stores needed to understand the audit. No exhaustive file tree.
