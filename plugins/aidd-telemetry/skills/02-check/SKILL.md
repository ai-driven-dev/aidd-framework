---
name: 02-check
description: States what is in place — where measurement is allowed from, whether an identity is attached, where records land, whether the recorder is declared — then answers whether AIDD measurement is actually recording, one independently verifiable line per claim. Use when the user doubts a figure, sees no run file appear, wants proof the chain is working, or wants to know what is already configured. Not for turning measurement on or answering what a period cost.
argument-hint: project
---

# Check

```mermaid
flowchart LR
  ask([project]) --> locate --> diagnose
  diagnose --> inplace([what is in place])
  inplace -.->|"measurement off"| stopped([stopped])
  inplace -.->|"not a git repository"| stopped
  inplace --> answer([four claims])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                       |
| -------- | ------------------------------------------- |
| locate   | confirm the CLI                              |
| diagnose | run it, and present every line it printed    |

## Transversal rules

- Checking that a hook fired is not the same as checking that a file exists. A run file with only `session_start` is not evidence of anything closed.
- Run only `aidd telemetry check`. Never a script, and never a command belonging to another skill.
- Present every printed line. A line this skill leaves out is a claim the user cannot check.
- What is in place is printed first and is never a claim — it appears whether or not measurement is on, and names the file behind every fact so the user can go and change it.
- `ok`, `FAIL` and `--` are three different answers. `--` means there was nothing to evaluate, not that the chain is healthy.
- A declaration that the recorder is set up is not proof it fired. Relay it as what it is — a fact about configuration, never a promise about behaviour.
- The `aidd` command cannot be found: say so and check nothing.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-telemetry:02-check"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
