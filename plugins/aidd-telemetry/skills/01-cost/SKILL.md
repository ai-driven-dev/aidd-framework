---
name: 01-cost
description: Answers what a period or one task consumed - a total, a day-by-day series, or a breakdown by step, model, task, backlog item, orchestrated flow, tool, project or person - and hands back the artefact each question deserves. Use when the user asks what a piece of work cost, what changed, where the effort went, which task, which backlog item or ticket, which orchestrated run, for which project, or who spent it. Not for turning measurement on.
argument-hint: task | period
---

# Cost

```mermaid
flowchart LR
  ask([task or period]) --> locate --> collect --> report
  locate -.->|"not measuring"| stopped([stopped])
  collect -.->|"nothing journalled"| stopped
  report --> answer([answer])
```

## Actions

Run the flow above. Read only the next action file.

| Action  | Does                                              |
| ------- | -------------------------------------------------- |
| locate  | find the script and check the switch               |
| collect | read what each tool's own files hold               |
| report  | choose the axis the question needs, then answer with the artefact it deserves |

## The question, not the flag

Someone asking what last month cost does not know which axis answers them. Read the
question, offer these axes in its own language, and derive the flags - never hand back a
menu and ask them to pick.

| The question sounds like | Axis | Artefact |
| --- | --- | --- |
| what did this cost, how much did it use | total | one total, in a line |
| what changed, which day spiked | day | a series, one row per day |
| where did it go, which step, model, tool or project took it | step, model, tool or project | a breakdown table |
| which framework task | task | one row per task declared in the period, plus the remainder with no task declared |
| per backlog item, per ticket, what did issue X cost | backlog | one row per backlog item a task declared, plus tasks that named none, plus the remainder with no task at all |
| per orchestrated run, per flow, what did that pipeline cost | flow | one row per orchestrated run the journal's own sequence names, plus the remainder that ran outside any flow |
| which subagent, what did delegation cost | agent | one row per agent that ran, plus the main thread's own row |
| which prompt, which turn, what did one request cost | prompt | one row per prompt that caused work, dated, plus the row for records naming none |
| for a report, to paste, to send, to keep | any of the above | the same artefact, written to a file |
| per person, who spent, which teammate | person | one row per resolved person plus every unresolved identity, each with the raw identities behind it |

## Transversal rules

- Answer only through `aidd telemetry read` and `aidd telemetry report`. Never a script beside this skill: the report is computed in one place, and that place is the CLI.
- Report what the script printed. Recomputing a figure a second way is how two figures start disagreeing.
- An absent number is not a zero. Say the figure is unknown and give what is known instead.
- Turning measurement on belongs elsewhere. Stop and say so rather than doing it here.
- The script cannot be found or fails: say so and show no figure.

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-telemetry:01-cost"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
