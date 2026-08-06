# 01 - Inspect

Resolve the backlog scope and event before changing anything.

## Input

A request, artifact, backlog location, or current context.

## Output

The resolved scope, event, support, authority, and backlog read model. A question is answered from that model and changes nothing.

## Process

1. **Resolve.** Apply [supports](../references/supports.md).
2. **Read.** Load the backlog through the selected support.
3. **Event.** Apply [events](../references/events.md) to the request and current states.
4. **Mode.** Resolve authority with [modes](../references/modes.md).
5. **Scope.** Include only artifacts that can be changed by this event.
6. **Clarify.** Ask one question and wait only when event, scope, authority, or support remains ambiguous.

## Test

| Case | Pass |
| --- | --- |
| No backlog | empty model; create event |
| Backlog held elsewhere | read model reported as partial, never as an empty backlog |
| Several supports or authorities | one selection question; no inferred choice |
| No mode | interactive authority |
| Autonomous without bounds | changes stay inside the resolved scope |
| Memory conflicts with support | conflict returned; no inferred mapping |
| Resolved scope | event, support, authority, and affected identities are explicit |
| Question | answered from the read model; workspace unchanged |
