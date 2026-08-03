# 01 - Gather needs

Walk the user through the 24-item checklist via interactive Q&A until all 18 user-input items (blocks 1 to 3) are filled. The 6 derived items (block 4) stay empty here; actions 02 and 04 fill them.

## Input

A free-form user request to bootstrap a new SaaS project.

## Output

A filled copy of [checklist.md](../assets/checklist.md) held in conversation context, not yet written to disk, with every user-input item's `<...>` placeholder replaced by a concrete value.

## Process

1. **Show.** Read [checklist.md](../assets/checklist.md) and print the four blocks as one markdown checklist so the user sees the full scope upfront.
2. **Ask.** Ask block by block, one block per message, all questions in a block at once. Do not ask block 4; it is derived.
3. **Fill.** Fill each item from the answer. When an answer is vague ("scalable", "fast"), ask one follow-up to make it concrete (numbers, examples).
4. **Check.** After block 1, sanity-check coherence: does the type match the user volume, are the integrations realistic for the platform target.
5. **Resolve.** After block 3, surface conflicts (for example budget under 50€/mo with an AWS preference and a heavy backend) and force a re-answer on the conflicting item.
6. **Confirm.** Print the filled checklist (blocks 1 to 3) and wait for the user to confirm "go" before action 02.

## Test

- The 18 user-input items have no remaining `<...>` placeholders.
- The 6 block-4 items are still placeholders.
- The user explicitly confirmed the filled checklist before action 02 starts.
