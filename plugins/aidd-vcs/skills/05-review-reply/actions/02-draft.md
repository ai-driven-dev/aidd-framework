# 02 - Draft

Write one reply per thread from `collect`'s output.

## Input

The list of threads from `collect`.

## Output

A drafted reply text per thread, following [tone.md](../references/tone.md).

## Process

1. **Read.** For each thread, read the referenced file around the commented line (about 20 lines of context) to understand what the reviewer saw and why they commented.
2. **Judge.** Decide the stance: the point is already fixed, the point stands and is answered with a reason, or a clarification is owed instead of a fix.
3. **Write.** Draft the reply per [tone.md](../references/tone.md) — the why, not just the what — matching the reviewer's language.

## Test

- Every drafted reply names the specific mechanism from the code, not a restatement of the comment.
- No draft exists for a thread `collect` excluded.