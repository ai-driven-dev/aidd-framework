# 01 - Inspect

Resolve the backlog scope and event before changing anything.

## Input

A request, artifact, backlog location, or current context.

## Output

The resolved scope, event, support, authority, and backlog read model.

## Process

1. **Resolve.** Apply [supports](../references/supports.md) to the request, loaded project memory, existing artifacts, and available supports.
2. **Read.** Load the backlog through the selected support.
3. **Event.** Apply [events](../references/events.md) to the request and current states.
4. **Mode.** Resolve authority with [modes](../references/modes.md).
5. **Scope.** Include only artifacts that can be changed by this event.
6. **Clarify.** Ask one question and wait only when event, authority, or support remains ambiguous.

## Test

| Case | Pass |
| --- | --- |
| No backlog | empty valid graph; intake event |
| Backlog held elsewhere | read model reported as partial, never as an empty backlog |
| Invalid graph | owning capabilities report it; no artifact change |
| Several supports or authorities | one selection question; one authority per artifact or field; no inferred choice, no manual mirror |
| No mode | interactive authority |
| Autonomous without bounds | no write; one authority question |
| Memory conflicts with support | conflict returned; no inferred mapping |
| Resolved scope | event, support, authority, and affected identities are explicit |
