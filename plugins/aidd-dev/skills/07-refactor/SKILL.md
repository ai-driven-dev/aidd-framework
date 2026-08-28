---
name: 07-refactor
description: Improve code across four axes (cleanup, performance, security, architecture) by scanning and fixing, or applying a pushed audit report. Use when the user wants to refactor, optimize, harden, or remove code. Not for read-only diagnosis or adding tests.
argument-hint: scope | audit
---

# Skill: refactor

The act-side of code improvement: it changes code to make it better. Behavior-preserving for cleanup, performance, and architecture; security may change behavior on purpose to close a hole.

## Actions

| #   | Action         | Axis         | Lens                                                       |
| --- | -------------- | ------------ | ---------------------------------------------------------- |
| 01  | `performance`  | performance  | N+1, hot paths, batching, memoization, unnecessary I/O      |
| 02  | `security`     | security     | OWASP, input validation, authz, secrets: harden and fix    |
| 03  | `cleanup`      | code-quality | clean code: rename, extract, DRY, dead code, complexity     |
| 04  | `architecture` | architecture | extract layers, fix coupling, enforce boundaries            |

Run the one axis named, or offer all applicable when the request is unscoped.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Scope: run the one named axis, or for an unscoped request ask once "all applicable axes, or one?" before running. A request to delete or remove code runs `cleanup` directly, with no axis question. Never silently default to one axis.
- Behavior-preserving for cleanup, performance, and architecture: public inputs and outputs stay identical, verified by tests, type checks, or a side-by-side run. Security may alter behavior to close a vulnerability, and must call that out explicitly.
- Audit-fed, optional: when the caller pushes an audit report (a path under `aidd_docs/tasks/audits/` or pasted findings), take its findings for this axis as the fix list and skip the scan. The bridge is the report artifact; this skill never loads or calls another skill. The audit `code-quality` pillar feeds the `cleanup` axis; the other axes map by name.
- Severity uses the shared 3-level scale: 🔴 critical, 🟡 warning, 🟢 minor.
- Stay inside the axis: dependency upgrades and UI redesign are out of scope. Add tests only as a regression for a security fix, never otherwise.
