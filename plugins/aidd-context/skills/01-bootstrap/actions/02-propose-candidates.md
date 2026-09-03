# 02 - Propose candidates

Derive 2 to 3 candidate stacks from the filled checklist, then render a markdown comparison table.

## Input

The filled checklist (blocks 1 to 3) from action 01.

## Output

A markdown comparison table with 2 to 3 rows, each a candidate with its front, back, DB, hosting, auth, architecture pattern, monthly cost, and risks.

## Process

1. **Read.** Read the filled checklist from action 01.
2. **Derive.** Apply each rule from [stack-heuristics.md](../references/stack-heuristics.md) to derive the recommended family for architecture pattern, front, back, DB, auth, and hosting.
3. **Spread.** Build 2 to 3 candidates spanning the trade-off space, differing on at least one of hosting model (PaaS, self-host, serverless), back-end language, or architecture pattern. Never propose near-identical candidates.
4. **Cost.** Estimate each candidate's monthly cost at the user's six-month volume target with rough public pricing, flagging uncertainty.
5. **Risk.** List 1 to 3 honest risks per candidate (lock-in, ops burden, learning curve, scaling limit). No candidate has zero.
6. **Render.** Render the comparison table, bolding each candidate's name. Do not pick a winner; that is action 04, after the audit.

## Test

- The output is a markdown table with at least two rows.
- The columns include front, back, DB, hosting, auth, architecture, cost, and risks, each cell non-empty.
- At least two rows differ on hosting model, back-end language, or architecture pattern.
