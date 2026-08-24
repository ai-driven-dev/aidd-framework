# 05 - Take it back

Stop new records carrying this person's identifier, without touching what is already
written under it.

## Input

The path to `telemetry-identity.cjs`.

## Output

The user-scoped `identity.json` removed, and a plain statement of what stays and what
starts fresh.

## Process

1. **Check first.** Run `node <telemetry-identity.cjs> status`.
   - Already off: relay it and stop.
2. **Withdraw.** Run `node <telemetry-identity.cjs> off` and relay everything it prints:
   new records carry no person from this moment; records already stored keep the identifier
   they were written with, unchanged — nothing is deleted or rewritten in the sink itself;
   and opting in again later mints a fresh identifier, never the one just withdrawn.

## Test

| Case | Pass |
| --- | --- |
| Was identified | `identity.json` is removed; the message names what stays and what starts fresh |
| Was never identified | nothing changes, and it says so rather than erroring |
| Records already stored | untouched — this action only stops what happens next |
