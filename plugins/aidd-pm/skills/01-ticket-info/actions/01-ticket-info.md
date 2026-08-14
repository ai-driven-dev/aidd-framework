# 01 - Ticket Info

Resolve the ticket identifier, query the configured ticketing tool, and display the relevant fields.

## Input

An optional ticket id or URL. When omitted, auto-detect it from the current branch name.

## Output

The ticket rendered per [ticket-template.md](../assets/ticket-template.md).

## Process

1. **Resolve.** Resolve the ticketing tool and the ticket identifier per [tool-detection.md](../references/tool-detection.md).
2. **Query.** Invoke the configured ticketing tool to fetch the ticket record.
3. **Display.** Fill [ticket-template.md](../assets/ticket-template.md) from the queried record and render it for the user.

## Test

| Case | Pass |
| --- | --- |
| The id resolves and the tool answers | every field `ticket-template.md` defines matches the queried record |
| The displayed URL is opened | the tracker shows the same ticket |
