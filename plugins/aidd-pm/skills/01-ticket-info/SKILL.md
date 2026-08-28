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
