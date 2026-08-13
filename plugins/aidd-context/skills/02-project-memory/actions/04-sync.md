# 04 - Sync

Wire the memory into the tools the user picks.

## Input

The memory bank in `aidd_docs/memory/`.

## Output

Each picked tool's context file, carrying the filled block.

## Process

1. **Require.** Stop unless `aidd_docs/memory/` holds a `.md` file.
   - Stopped: send the user to write the memory first.
2. **Detect.** Find the AI tools present per [tools.md](../references/tools.md).
3. **Pick.** Show every tool, the detected ones ticked, and wait for one or several.
4. **Upsert.** Ensure each picked tool's context file carries the block, per [tools.md](../references/tools.md).
   - Absent file: create it from [AGENTS.md](../assets/AGENTS.md).
   - Its AIDD structure differs: offer to reconcile it, applying only what the user approves.
5. **Fill.** Run `hooks/update_memory.js` from the project root, naming the picked tools.
   - Non-zero exit: show the error and stop.
   - Script unavailable, the skill shipped without its plugin: write each block from the bank by hand.
6. **Verify.** Read each picked tool's block back and compare it to the bank.
   - Any file listed that the bank lacks, or held that the block lacks: the fill did not land, report it and stop.

## Test

| Case | Pass |
| --- | --- |
| `aidd_docs/memory/` holds no `.md` | sync creates no context file and stops |
| The script runs | it exits `0` |
| A picked tool's block is read back | it lists every root `.md` of the bank except `README.md`, and nothing else |
| A bank file is added, then sync runs again | the block gains that file and keeps the rest |
| A tool was not picked | its context file is unchanged |
