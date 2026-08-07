---
name: 01-ticket-info
description: Retrieve and display a ticket from the configured ticketing tool. Use when the user wants to see, show, or look up a ticket's details. Not for creating a ticket, or commenting on, transitioning, or reassigning one.
argument-hint: ticket
---

# Ticket Info

Reads ticket details from the configured ticketing tool. Read-only and tool-agnostic.

## Actions

| #   | Action         | Role                                                          | Input                              |
| --- | -------------- | ------------------------------------------------------------- | ---------------------------------- |
| 01  | `ticket-info`  | Resolve ticket id, query the configured tool, display fields   | ticket_id (optional)               |

Before running an action, read its file in `actions/`, not only the table or assets.

## Transversal rules

- Read the configured ticketing tool from project memory first; otherwise inspect repo configuration or environment.
- Auto-detect the ticket identifier from the current branch name when none is provided.
- Format the identifier per project convention before querying.
- Read-only: never create, comment, transition, or reassign from this skill.
