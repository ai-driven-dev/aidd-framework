# 04 - Let a person choose to be named

Ask this person, on their own machine, whether records this machine reads locally should
carry their own identifier. Measurement being on says nothing about this — it is a
separate choice, made or declined independently of the project switch.

## Input

The path to `telemetry-identity.js`, resolved the same way `telemetry-switch.js` is (see
01-check) — beside it, under this same skill's `scripts/`.

## Output

Either nothing changed, or a user-scoped `identity.json` holding a fresh identifier this
person can withdraw at any time, and a user who knows exactly what it does and does not do.

## Process

1. **Check first.** Run `node <telemetry-identity.js> status`.
   - Already on: relay it and stop — no consent to ask again for a choice already made.
2. **Say what it attaches, before asking.** Turning this on attaches one stable, random
   identifier — never an email, a git author, or a hostname — to records this machine reads
   locally, from the moment it is turned on. It never reaches the run journal, never applies
   to a session already recorded, and never attaches to a tool's own OTLP export, since that
   route is not guaranteed to run on this person's own machine. A display name is a
   separate, later choice; turning this on alone sets none.
3. **Ask.** Wait for a yes.
   - Declines: stop, and write nothing.
4. **Turn it on.** Run `node <telemetry-identity.js> on` and relay what it prints.
5. **Offer a display name, separately.** Ask whether they also want a display name shown
   beside their figures. Only on a yes, ask for the value and run
   `node <telemetry-identity.js> name "<value>"`. A no here is not a smaller yes to the
   identifier question — nothing beyond the identifier is set.
6. **Say it is reversible.** `node <telemetry-identity.js> off` stops new records carrying
   it; what is already stored keeps the identifier it was written with.

## Test

| Case | Pass |
| --- | --- |
| The user agrees | `identity.json` holds a fresh `person_id`; the run's output says what it does and does not attach to |
| The user declines | no file is created |
| Already identified | it relays the existing identity and does not ask again |
| The user declines a display name | the identifier is still set; no display name is |
| Repository or CI cannot make this choice | the script reads only this machine's own profile, never `.aidd/config.json` or `AIDD_USER_CONFIG_DIR` |
