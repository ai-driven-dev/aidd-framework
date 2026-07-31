# 03 - Present

Render the screen the decision names.

## Input

The current decision.

## Output

The rendered screen, and the user's reply.

## Process

1. **Shape.** Fill the chosen screen from [report.md](../assets/report.md).
   - Framing line on the first report of the session only.
   - Exactly one action block per screen, carrying its key once.
   - The idle menu is a next-action block. Slot 1 is the action line, slots 2 to 4 join the options line. Never a list.
   - The state block carries every foundation, so the foundations step count reads off it.
   - Glyphs: ✅ met · ⚠️ present, not wired · ❌ missing.
   - A used tool that lacks the block is `⚠️`, never `❌`. Only a missing required foundation takes `❌`.
   - Every `⚠️` shows its cause and a keyed fix.
   - Short lines.
   - The options line is the last line. Print nothing after it, no detail block, no state snapshot, no hint about what comes next.
   - Command ids, tier clauses, and lookahead only under `[d]`.
   - Keys are letters or digits. Never `?`, `!`, `/`, `@`, `#`: the host takes those.
2. **Inject.**
   - Entry screen takes [banner.txt](../assets/banner.txt).
   - Flow or walk screen loads [flow.md](../references/flow.md).
3. **Wait.** Offer the screen, take the reply.

## Test

- The framing line shows on the first report of the session only.
- An existing repo renders memory as step 1 of 2.
- A greenfield repo renders the stack first.
- The banner shows on entry screens only.
- Every `⚠️` carries a keyed fix.
- The key appears once per screen.
- Nothing renders after the options line.
