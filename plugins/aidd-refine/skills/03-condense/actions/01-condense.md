# 01 - Condense

Toggle terse output mode and apply the requested intensity rules to subsequent prose turns.

## Input

- Whether condense is currently on (and at which level) or off, read from session context.
- The requested change: a level (lite, full, ultra) or a plain on/off toggle.

## Output

A single confirmation line: `Condense: ON (<level>).` when enabling, or `Condense: OFF.` when disabling.

## Process

1. **Detect.** Read the toggle command and target level from the user message.
2. **Resolve.** Combine the current state with the request:
   - Explicit level (`lite | full | ultra`) sets that level (or switches level if already on).
   - `toggle` flips on/off; default level when turning on is `full`.
   - Off phrases (`stop condense`, `normal mode`) force off.
3. **Emit.** The reply MUST begin with this exact line, filled in and unaltered: `Condense: ON (<level>).` when enabling, or `Condense: OFF.` when disabling. The stats action and the hook parse this line from the transcript, so never paraphrase, decorate, or omit it.
4. **Apply.** Apply the transversal rules to every subsequent prose turn until the next off signal, using per-level rules and auto-pause passages from [intensity-levels.md](../references/intensity-levels.md).

## Test

- After ON, the next non-code, non-warning turn drops articles at the active intensity; after OFF, it returns to normal prose.
- Code blocks, quoted errors, and security warnings stay verbatim regardless of state.
