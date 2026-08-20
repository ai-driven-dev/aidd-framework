# Local cost read

## Target

What a session consumed is readable from the files its tool already wrote, with no process running and nothing exported.

## Hard constraints

- No long-lived process. Reading happens when something asks for it, never as a daemon.
- Reading is never on a session's critical path. It must not block, slow, or fail a session, and a session that is still running must not be corrupted by being read.
- What is read is normalised into the shape the existing stored record already uses, so that whatever consumes it sees one format whether the figures arrived by reading or by export.
- Every stored figure carries where it came from. A figure read locally and a figure received from an export are not interchangeable and must never be indistinguishable.
- Only fields already permitted by the existing allowlist are kept. The local path chooses what to read, so nothing outside that list is ever extracted in the first place.
- No prompt, response, diff, or file content is read, whatever else the file contains.
- The join to the run journal uses the session identity already in use. No new correlation key.
- A tool whose file format has moved fails loudly against a captured fixture, rather than silently producing a wrong figure. These are internal, undocumented formats; the format moving is expected, not exceptional.
- Which tools are covered and which are not is visible to the person reading, not inferred from an empty result.
- Reading the same session twice does not double what is stored.
- No dollar amount is produced here. None of the readable files contains one.

## Non-goals

- Turning tokens into money. The price table is a separate deliverable, and this one deliberately stops at the counters.
- Presenting anything. What is read is stored, not formatted or reported.
- Removing the export path. It remains for whoever wants a billed amount rather than a computed one, and for anyone whose tool exports but writes nothing readable.
- Copilot. Its files carry one counter per turn and nothing else — no per-request input figure exists, so no per-step breakdown can be built from it. Naming it uncovered is in scope; covering it is not.
- Cursor. It writes no counter anywhere, and its export is a setting nobody outside an enterprise administrator can enable. Uncovered by both routes, and this deliverable does not change that.
- Deciding when the read is triggered beyond a working default. Scheduling it is a later concern.

## Done-when

- A session on a covered tool yields its token counts and its model, with nothing exported and no process having been started.
- The figures land in the same stored shape an exported session lands in, and a consumer reading them cannot tell which route was used except by the field that says so.
- A tool that cannot be read reads as uncovered, distinctly from a tool that ran and consumed nothing.
- Reading a session twice leaves the store as it was after the first read.
- Changing any covered tool's file format turns a test red before it can produce a wrong figure.
- Reading a session that is still in progress neither corrupts the store nor disturbs the session.
- Nothing outside the existing allowlist appears in what is stored, asserted against a real captured file rather than a constructed one.

## Stakeholders

- Decider: repository owner
- Owner: the telemetry layer
- Consumer: the reporting deliverable, and the price table that turns these counters into an amount

## Context

- Decided in https://github.com/ai-driven-dev/framework/issues/684: local reading becomes the default path, the receiver becomes opt-in. That issue records the argument and its cost.
- Ticket: https://github.com/ai-driven-dev/framework/issues/685, which carries the per-tool measurements — where each file lives, what it holds, and at what granularity.
- Blocks https://github.com/ai-driven-dev/framework/issues/629, whose output format must mark each amount as computed or billed.
- Paired with https://github.com/ai-driven-dev/framework/issues/654, which owns turning counters into money and is load-bearing because none of these files carries an amount.
