# Report output discipline

The hard constraint on what the `03-report` action may deliver. Read it before drafting the report.

## What the output contains

Exactly these blocks, in this order, and nothing else:

1. The rewritten text, with a `[n]` marker on each verified or corrected claim and a `(unverified - no source found)` marker on each unverified claim.
2. A `## Sources` block.
3. A `## Unverified claims` block, only when at least one claim is unverified.

## What is forbidden

These belong to the earlier actions and never appear in the output:

- Any cascade or tier trace. Never write `Cascade`, `tier 1`, `tier 2`, `tier 3`, `miss`, `N/A`, or `resolved`.
- Any category label: `hard-to-know`, `version`, `api-signature`, `date-event-person`, `project-fact`.
- Any raw verdict word: `verdict`, `claim false`, `claim true`, or the values `verified` / `refuted` / `conflict` / `unverified` used as a status (the inline `(unverified - no source found)` marker is the one allowed exception).
- How a claim was checked: shell commands, `ls` / `find` / grep output, or phrases like "by inspection" or "codebase inspection". Cite the source and state the conclusion, not the method.
- Any sentence explaining why a cache line was or was not added.

The report is plain prose. No active output mode restyles it; render it normally however the surrounding conversation is styled.

Before delivering, scan the draft: if a line carries any forbidden item, delete that line.
