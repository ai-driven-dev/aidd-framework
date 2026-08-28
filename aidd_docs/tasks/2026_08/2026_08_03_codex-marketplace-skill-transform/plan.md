---
objective: "Codex marketplace installs from this origin distribute transformed SKILL.md files with no model frontmatter."
status: reviewed
---

# Plan: Transform Codex marketplace skills

## Overview

| Field | Value |
| --- | --- |
| **Goal** | Make native Codex marketplace output use the same skill-frontmatter conversion as the AIDD CLI install path. |
| **Source** | [upstream issue #570](https://github.com/ai-driven-dev/framework/issues/570) |

## Phases

| # | Phase | File |
| --- | --- | --- |
| 1 | Apply and prove skill transformation | [phase-1.md](./phase-1.md) |
| 2 | Verify installed origin marketplace | [phase-2.md](./phase-2.md) |

## Resources

| Source | Verified |
| --- | --- |
| https://github.com/ai-driven-dev/framework/issues/570 | Native Codex marketplace currently bypasses `stripCodexSkillFrontmatter`; installed skills must omit `model`. |

## Decisions

| Decision | Why |
| --- | --- |
| Make marketplace skill writes honor each target's existing skill artifact transform. | It reuses the target contract rather than adding a Codex-only branch, keeps Claude source untouched, and makes native marketplace output follow the same conversion policy as the CLI install path. |
