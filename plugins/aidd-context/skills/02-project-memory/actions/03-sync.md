# 03 - Sync

Wire the memory into the tools the user picks.

## Input

The memory bank in `aidd_docs/memory/`.

## Output

Each picked tool's context file, carrying the filled block.

## Process

1. **Require.** Stop unless `aidd_docs/memory/` holds a `.md` file. Send the user to generate first.
2. **Detect.** Find the AI tools present per [tools.md](../references/tools.md).
3. **Pick.** Show every tool, the detected ones ticked. Let the user pick one or several. Wait for the pick.
4. **Upsert.** Ensure each picked tool's context file carries the block, shaped like [AGENTS.md](../assets/AGENTS.md).
   - Absent file: create it from that template.
   - Existing file: add only the missing `## Memory Management` section or block, leaving the rest untouched.
   - If its AIDD structure differs from [AGENTS.md](../assets/AGENTS.md), offer to reconcile it, applying only what the user approves.
   - Touch no file a picked tool does not resolve to.
5. **Fill.** Run `hooks/update_memory.js` from the project root, naming the picked tools.
6. **Guard.** On a non-zero script exit, show the error and stop.
7. **Verify.** Read each picked tool's block back. An empty one means the fill did not land.

## Test

| Case | Pass |
| --- | --- |
| `aidd_docs/memory/` holds no `.md` | sync creates no context file and stops |
| The script runs | it exits `0` |
| A tool was picked | its context file exists, its block listing every file in `aidd_docs/memory/` |
| A tool was not picked | its context file is unchanged |
| The action completes | `git diff --cached` is empty |
