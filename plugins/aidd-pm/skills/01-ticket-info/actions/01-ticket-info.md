# 01 - Ticket Info

Resolve the ticket identifier, query the configured ticketing tool, and display the relevant fields.

## Input

An optional ticket id or URL. When omitted, auto-detect it from the current branch name.

## Output

The ticket's title, description, status, assignee, priority, and URL, displayed for the user.

## Process

1. **Tool.** Use the ticketing tool declared in project memory. Otherwise inspect the repo configuration or environment for the configured tool.
2. **Identifier.** Use the provided ticket id when given. Otherwise take it from the current branch name, per project convention.
3. **Format.** Apply the project ticketing convention to the identifier (prefix, separator, casing).
4. **Query.** Invoke the configured ticketing tool to fetch the ticket record.
5. **Display.** Render the title, description, status, assignee, priority, and URL.

## Test

| Case | Pass |
| --- | --- |
| The id resolves and the tool answers | title, description, status, assignee, priority, and URL match the queried record |
| The displayed URL is opened | the tracker shows the same ticket |
