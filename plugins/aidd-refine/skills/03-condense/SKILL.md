---
name: 03-condense
description: Toggle terse output mode (lite, full, ultra) that drops filler while code and errors stay verbatim, and report token savings. Use to condense output, switch intensity, or check savings. Not for editing prose or compressing code.
argument-hint: lite | full | ultra | stats
---

# Condense

Toggles a terse output mode with three intensity levels (lite, full, ultra). Strips articles, filler, and pleasantries from prose while preserving technical substance, code blocks, quoted errors, and security warnings.

## Actions

| #   | Action     | Role                                                                  | Input                                |
| --- | ---------- | --------------------------------------------------------------------- | ------------------------------------ |
| 01  | `condense` | Toggle terse mode and apply intensity rules                           | current state + requested level      |
| 02  | `stats`    | Report real token usage and estimated savings for the current session | session messages + level timeline    |

Dispatch by intent: a toggle phrase → `condense`, a savings query → `stats`.
Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- **Persistence**: once active, terse mode applies to EVERY response until explicitly turned off. Do not drift back to verbose prose after many turns, when uncertain, or when the task changes. The level remains active for the rest of the session unless changed or stopped.
- **Off switch**: terse mode stops only on explicit user signal: `stop condense`, `normal mode`, or invoking the skill again to toggle.
- **Toggle**: invoking the skill while active toggles it off; invoking while off turns it on at the default level (`full`) unless an explicit intensity is given.
- **Drop fluff**: drop articles (a/an/the), filler (just/really/basically/actually/simply), pleasantries (sure/certainly/of course/happy to), and hedging. Fragments are acceptable.
- **Short synonyms**: prefer short words (big not extensive, fix not "implement a solution for"). Technical terms stay exact. Code blocks are unchanged. Errors are quoted verbatim.
- **Pattern**: `[thing] [action] [reason]. [next step].`
- **Auto-pause**: drop terse mode for the passages listed in `references/intensity-levels.md` (security warnings, irreversible confirmations, ambiguity risks), then resume.
- **Boundaries**: code, commits, and pull request bodies are written in normal English regardless of intensity.

## References

- `references/intensity-levels.md`: detailed per-level rules and side-by-side examples.
