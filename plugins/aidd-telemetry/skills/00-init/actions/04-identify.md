# 04 - Let a person choose to be named

Ask this person, on their own machine, whether records this machine reads locally should
carry their own identifier. Measurement being on says nothing about this — it is a
separate choice, made or declined independently of the project switch.

## Input

A confirmed `aidd` command, from check.

## Output

Either nothing changed, or a user-scoped `identity.json` holding a fresh identifier this
person can withdraw at any time, and a user who knows exactly what it does and does not do.

## Process

1. **Check first.** Run `aidd telemetry identity status`.
   - Already on: relay it and stop — no consent to ask again for a choice already made.
2. **Say what it attaches, before asking.** Turning this on attaches one stable, random
   identifier — never an email, a git author, or a hostname — to records this machine reads
   locally, from the moment it is turned on. It never reaches the run journal, never applies
   to a session already recorded, and never attaches to a tool's own OTLP export, since that
   route is not guaranteed to run on this person's own machine. A display name is a
   separate, later choice; turning this on alone sets none.
3. **Ask.** Wait for a yes.
   - Declines: stop, and write nothing.
4. **Turn it on.** Run `aidd telemetry identity on` and relay what it prints.
5. **Offer a display name, separately.** Ask whether they also want a display name shown
   beside their figures. Only on a yes, ask for the value and run
   `aidd telemetry identity name "<value>"`. A no here is not a smaller yes to the
   identifier question — nothing beyond the identifier is set.
6. **Say it is reversible.** `aidd telemetry identity off` stops new records carrying
   it; what is already stored keeps the identifier it was written with.
7. **Offer to link another identifier, when this person names a second tool or machine.**
   Once identified here, running `aidd telemetry identity link <identity>` on that other
   identifier declares it the same person: both fold into one row in every report from
   then on, instead of printing as two. `link` is a declaration the CLI cannot verify -
   only offer it for an identifier this person actually owns, never one seen on someone
   else's record. This writes to the same profile-local
   `person-mapping.json` (beside `identity.json`, under this machine's own user profile,
   never `.aidd/config.json` or `AIDD_USER_CONFIG_DIR`) — refused before this step is done,
   since a mapping entry needs an opted-in identity to anchor it, and refused when another
   person already claims that identity. Linking one already listed reports it as already
   listed, not as a second write. `aidd telemetry identity unlink <identity>` removes one
   identifier from the mapping without touching this person's own identity — reports go
   back to counting it unresolved. Unlinking one nobody listed reports nothing to remove,
   never a failure.

## Test

| Case | Pass |
| --- | --- |
| The user agrees | `identity.json` holds a fresh `person_id`; the run's output says what it does and does not attach to |
| The user declines | no file is created |
| Already identified | it relays the existing identity and does not ask again |
| The user declines a display name | the identifier is still set; no display name is |
| Repository or CI cannot make this choice | `aidd telemetry identity` reads only this machine's own profile, never `.aidd/config.json` or `AIDD_USER_CONFIG_DIR` |
| A second identifier is linked | `person-mapping.json` lists it under this person; a report folds both into one row |
| An identifier already listed is linked again | reported as already listed, not written twice |
| A linked identifier is unlinked | `person-mapping.json` no longer lists it; a report counts it unresolved again |
| An unlisted identifier is unlinked | reported as nothing to remove, not as a failure |
