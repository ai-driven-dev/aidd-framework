---
name: sample
description: Sample skill for testing reference rewriting.
allowed_tools:
  - Read
model: opus
unsupported: discard-me
---

# Sample Skill

This skill contains all three reference forms for testing rewrite behavior.

## Current-dir reference
@./neighbor.md

## Parent-dir reference
@../up.md

## Plugin-root reference
@${CLAUDE_PLUGIN_ROOT}/agents/planner.md

## Normal content
Regular content without any special references.
