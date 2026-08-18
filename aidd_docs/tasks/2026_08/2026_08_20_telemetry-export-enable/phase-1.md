---
status: pending
---

# Instruction: the switch

Part of [`plan.md`](./plan.md).

One answer to "is AIDD allowed to measure this project", read by everything, owned
by nobody's provider.

This phase ships no export. It ships the thing that can stop one.

## Why a file and not a directory

Today's opt-in is `aidd_docs/runs/` existing — one bit, expressed as a path. That
was right while there was one question. There are now several: which tools were
enabled, where the data goes, whether AIDD may use a tool's export at all. A
directory cannot say any of that, and encoding it in more directories would be a
format nobody would recognise as one.

## Why AIDD needs its own switch at all

A tool may be exporting telemetry for reasons that have nothing to do with this
framework: an organisation's collector, an unrelated setting, a default nobody
chose — Codex's `metrics_exporter` defaults to `statsig` and ships there unless
someone sets the key.

If AIDD's components keyed off "is the provider exporting", then turning on
telemetry for one purpose would silently enrol a project in another. **The
guarantee is that AIDD uses what AIDD was given, and nothing else.** That cannot
be delegated to a provider's setting.

## Tasks to do

### `1)` The file

1. `aidd_docs/telemetry.json`, committed, so the answer survives a clone and
   binds the project rather than whoever ran a command.
2. Minimum keys: whether AIDD telemetry is on, and the endpoint records are meant
   for. Nothing that duplicates what a tool's own config already states.
3. Absent file means **off**. A project that never decided has not consented.

> Not `.aidd/`. That directory is the CLI's install manifest — machine-local, and
> `aidd clean` removes it. A project-level decision cannot live somewhere a
> routine cleanup erases, and a decision that does not survive a clone is not the
> project's.

### `2)` Everything reads it

1. The journal hook checks it before writing, in addition to the directory it
   already checks.
2. It is read at the point of use, never cached across a session: something
   turned off stops mattering immediately.

> The hook is the first consumer because it is the one already shipping. A switch
> nothing obeys is a document, not a guarantee.

### `3)` Keep the failure direction

1. Unreadable, unparseable, absent → **off**, and the hook still exits 0.

> Same rule as everywhere in this layer: a measurement that breaks a session is
> worse than one that misses a session, and a switch that fails open is worse
> than both.

### `4)` Retire the directory as the switch, or state why it stays

1. Decide during implementation whether `aidd_docs/runs/` existing remains a
   second condition, or becomes merely where records land.

> Two switches that can disagree is the shape of a bug. If both stay, the file is
> authoritative and the directory is a location — write that down. If one goes,
> the migration is one line and no data exists yet to migrate.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | With no `telemetry.json`, a session writes nothing, even with `aidd_docs/runs/` present |
| 1 | The file is tracked by git, and a fresh clone inherits the answer |
| 2 | Turning it off mid-session stops the very next write, with no restart |
| 2 | With AIDD off but the provider exporting, the journal still writes nothing — the case the switch exists for |
| 3 | An unparseable file means off, and the hook exits 0 |
| 4 | Exactly one condition is authoritative, and the other is documented as a location rather than a permission |
