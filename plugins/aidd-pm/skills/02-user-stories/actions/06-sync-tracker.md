# 06 - Sync tracker

Gate the backlog on the Definition of Ready, get explicit approval, then save each story to the configured tracker.

## Input

The ranked backlog from `05-prioritize`.

## Output

One ticket per story created in the configured tracker, each capturing the returned id and url.

## Process

1. **Resolve target.** Read the active ticketing tool from project memory. If none is declared, ask the user which tracker to use rather than assuming one.
2. **Gate.** Check every story against the Definition of Ready in [rating.md](../references/rating.md). Send any failing story back to its action. Do not proceed while one fails.
3. **Present.** Show the full ranked backlog. Wait for explicit user approval before any write.
4. **Save.** On approval, create one ticket per story in the resolved tracker. Capture the returned id and url for each.
5. **Report.** Return the created stories with their ids and urls, in priority order.

## Test

- After approval, querying the configured tracker returns each saved story id with a matching title.
- The Definition of Ready holds for every saved story.
- No write happens before explicit user approval.
