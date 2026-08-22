---
status: draft
---

# Spec: a session says which ticket it is on

## What is wrong with the way it works now

A task is **inferred** from the files a session wrote. The journal records a repository-relative path each time a session writes inside a task folder, and the reader turns that path into the task's identity.

That inference needs the tool's own hook payload to name a path in a readable form, and **only Claude Code's does**. Copilot's and Cursor's were never captured doing so; Codex writes through an `apply_patch` command string that would have to be parsed rather than read. So four tools out of five report by period and by step, and never by ticket.

The whole layer exists to answer "what did story 428 cost". On four tools it cannot.

## The thing that was missed

The journal already records something it was *told* rather than something it inferred: `step_start`, carrying the name of the skill that is running. Nothing about that line depends on the shape of a tool's payload — a hook writes it because a skill announced itself.

A ticket can arrive the same way. The AIDD flow knows which one it is on: its plans live in `aidd_docs/tasks/<folder>`, and the skill that opens one holds that path. A declared line works on every tool, because it asks nothing of the tool.

Inference was built first and its limit was accepted as the layer's limit. It is not — it is the limit of inference.

## What this changes

- A ticket is **declared**, on any tool, and the figures join it the way they already join a step.
- The existing inference stays. Where a payload does name a path, that is still true and still recorded, and it covers work done outside a declared task.
- The two are told apart. A ticket a flow announced and a ticket derived from a file that happened to be written are different claims, exactly as `tool-stated` and `journal-interval` already are for a step.

## Done when

- A session on any of the five tools can report by ticket, with the ticket declared rather than derived.
- The report says how a ticket was known, and a consumer can tell a declaration from an inference.
- A session that declared no ticket reads as belonging to none, never to the last one seen.
- A declaration that closes is closed, and one left open by a crashed session does not swallow every session after it.
- Nothing about the existing per-file attribution changes for tools that already have it.

## The trap

A step boundary that never closes attributes everything after it to the wrong step. The same failure at ticket granularity would attribute a whole week to one ticket, and it would look plausible — which is the failure mode this layer exists to remove. Closing has to be as reliable as opening, and a session that ends without closing must not leave the next one poisoned.

## Not this

Which ticket a person *should* be on, or reading a backlog. This records what the flow already knows, at the moment it knows it.
