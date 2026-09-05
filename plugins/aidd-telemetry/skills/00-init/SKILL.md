---
name: 00-init
description: Turns AIDD measurement on for a project, proves it is recording, lets a person opt into (or out of) naming themselves on their own records, and removes what was measured when asked. Use when the user wants to start measuring what their work costs, wants to stop, asks why nothing is being recorded, wants their own name to appear on (or disappear from) what gets measured, or wants their measured data deleted. Not for answering what a piece of work consumed.
argument-hint: project
---

# Init

```mermaid
flowchart LR
  ask([project]) --> check --> enable --> verify
  check -.->|"already on"| verify
  verify --> recording([recording])
```

A second, independent choice belongs to the person rather than the project: whether their
own records carry an identifier at all.

```mermaid
flowchart LR
  ask2([this person]) --> identify
  identify -.->|"already chose"| status1([relayed, unchanged])
  identify -->|"opted in"| withdraw([forget: withdraw naming])
  withdraw -.->|"never opted in"| status2([relayed, unchanged])
```

A third, independent ask reaches the same action, and needs neither of the two above:
removing what this tool measured, wholly, on this machine.

```mermaid
flowchart LR
  ask3([asks to be forgotten]) --> shown([forget: shown what would go, and what history keeps])
  shown -->|"confirms"| removed([removed, in counts shown])
  shown -.->|"declines"| status3([nothing removed])
```

## Actions

Run the flow above. Read only the next action file.

| Action   | Does                                                    |
| -------- | -------------------------------------------------------- |
| check    | confirm the CLI and read the current switch                |
| enable   | ask, then turn measurement on                              |
| verify   | prove a session is actually being recorded                 |
| identify | ask this person, then attach their own identifier, and offer to link another identifier as the same one |
| forget   | withdraw naming, or remove everything this tool measured — two different asks, one action |

## Transversal rules

- Measuring someone's project is theirs to allow. Ask before turning it on, always.
- Naming a person is theirs alone to allow, separately from the project switch above — never assumed from the project being measured, never asked on someone else's behalf.
- Run only `aidd telemetry on --yes`, `aidd telemetry off`, `aidd telemetry identity`'s own verbs, and `aidd telemetry forget`'s own verbs (preview first, `--yes` only after this person has seen it and confirmed). Never a script, and never a command belonging to another skill.
- `aidd telemetry identity` never reads `.aidd/config.json` or `AIDD_USER_CONFIG_DIR` — both are settings a repository or a CI job can set, and this choice is not theirs to make. It reads and writes only this machine's own user profile.
- Removing what was measured is irreversible, and reaches further than one project: this machine's stored records span every project ever measured on it, not only the one being discussed. Never presented as reversible, and never presented as scoped to one project when it is not.
- What history keeps is relayed exactly as `aidd telemetry forget` states it — a journal already committed as certainly held, one merely staged but never committed as not yet held, one not tracked at all as possibly held — and is never presented as removable. No command in this skill rewrites git history.
- The `aidd` command cannot be found: say so and change nothing.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-telemetry:00-init"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
