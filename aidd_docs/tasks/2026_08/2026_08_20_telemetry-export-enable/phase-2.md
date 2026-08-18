---
status: pending
---

# Instruction: surgical write, exact removal

Part of [`plan.md`](./plan.md).

The settings file belongs to the user. This command visits it, adds a known set
of keys, and can take exactly those back out — leaving anything else it found,
including a key the user edited by hand between the two calls.

Pure domain work, no command surface yet: a function from settings-plus-inputs to
settings, and its inverse.

## Tasks to do

### `1)` Upsert a known set

1. Read the file if it exists, parse it, merge the block from phase 1 into
   `env`, write it back. An absent file is created; an absent `env` is added.
2. Preserve everything else exactly — key order, unrelated keys, and the
   formatting conventions of the surrounding file.
3. Follow the seam `MarketplaceSyncSettingsUseCase` already uses for this, rather
   than opening a second way to edit the same file.

### `2)` Remove exactly what was added

1. `disable` removes only the keys `enable` writes, and removes `env` itself only
   if it is then empty.
2. A key from the set that the user has since changed by hand is still removed —
   it is one of ours — but a key **outside** the set is never touched, whatever
   its name looks like.

> The test that matters is not "disable removes the keys". It is that
> **enable-then-disable leaves the file byte-identical to what it was before**,
> including whitespace, on a file that already had unrelated content. Anything
> less and the command is a one-way door people will not risk running.

### `3)` Idempotence

1. `enable` twice leaves the second write with nothing to change.
2. `disable` on a file that was never enabled succeeds and changes nothing.

### `4)` Nothing partial on failure

1. An unreadable or unparseable settings file stops with the path in the message
   and writes nothing.
2. A failed write leaves the original in place rather than a truncated file.

> Unlike the hook, this command **may** fail loudly: it is an explicit gesture,
> not something running inside a session. Exiting 0 on a failed write here would
> tell the user telemetry is on when it is not — the same silent-but-configured
> state the whole layer exists to detect.

## Test acceptance criteria

| Task | Acceptance criteria |
| ---- | ------------------- |
| 1 | An absent file, an empty file, and a file with unrelated keys all end up with the block and their original content intact |
| 2 | Enable then disable on a file with unrelated content restores it byte-for-byte |
| 2 | A hand-edited value inside our set is removed; a key outside it with a similar name survives |
| 3 | The second `enable` writes nothing, verified by mtime or by content equality |
| 3 | `disable` without a prior `enable` exits 0 and leaves the file untouched |
| 4 | An unparseable file fails with its path named, and the file is unchanged afterwards |
