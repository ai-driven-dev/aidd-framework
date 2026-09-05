---
name: 01-ticket-info
description: Retrieve and display a ticket from the configured ticketing tool. Use when the user wants to see, show, or look up a ticket's details. Not for creating a ticket, or commenting on, transitioning, or reassigning one.
argument-hint: ticket
---

# Ticket Info

```mermaid
flowchart LR
  source([ticket id, or none]) --> ticket-info --> done([ticket displayed])
```

## Actions

Run the flow above. Read only the next action file.

| Action        | Does                                                     |
| ------------- | --------------------------------------------------------- |
| ticket-info   | resolve ticket id, query configured tool, display fields |

## Say when this skill's work is done

Once this skill has produced what it was called for, and only then, run:

```shell
echo "aidd:step-end aidd-pm:01-ticket-info"
```

No host reports when a skill's work finished. A skill call's own result comes back in a
tenth of a second, which is the dispatch and not the completion, so a measurement that
never hears this ends the step where the next one begins — or, where none follows, at the
journal's own last witnessed moment, which credits this skill with everything the session
did afterwards.
