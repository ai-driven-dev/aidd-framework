---
name: 05-review-reply
description: "Reply to a developer's review comments on a GitHub pull request, one reply per thread, bots and Copilot excluded. Use when the user wants to answer, respond to, or reply to PR review comments. Not for creating a pull request, applying the requested changes, or reviewing a diff."
argument-hint: collect | draft | post
---

# Review Reply

```mermaid
flowchart LR
  collect --> draft --> post
```

## Actions

Read only the next action's file before running it.

| #   | Action    | Does                                                          |
| --- | --------- | -------------------------------------------------------------- |
| 01  | `collect` | Resolve the PR and fetch human review comments, bots excluded  |
| 02  | `draft`   | Read the code at each comment and write a reply per thread     |
| 03  | `post`    | Show the drafts, wait for confirmation, then post the replies  |

## Transversal rules

- Copilot and any user whose `type` is `Bot` are always excluded.
- One thread, one reply — merge several comments from the same author on the same subject before drafting.
- Never post before the user has seen and confirmed every draft.
- Applying the changes a comment requests, and committing or pushing, are separate steps not run here.