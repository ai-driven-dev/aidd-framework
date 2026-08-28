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
   to a session already recorded, and never leaves this machine — there is no route in this
   plugin that sends a record, identified or not, anywhere else. A display name is a
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
7. **On a second machine, offer to take the same identity rather than mint a new one.**
   The ordinary way to be one person across machines is `aidd telemetry identity use
   <identifier>` — taking the identifier this person already holds elsewhere, so both
   machines' records fold into one row. Taking the identifier already in effect here is
   reported as already in effect, not written twice; taking a different one replaces this
   machine's own identifier and says so, and records already written keep the identifier
   they were written with.
8. **Offer to link, only for an identifier this person cannot simply take as their own** —
   a tool's own pseudonymous identifier, or one kept from before a withdrawal. Running
   `aidd telemetry identity link <identity>` adds it onto this person's identity: both fold
   into one row in every report from then on, instead of printing as two. `link` is a
   declaration the CLI cannot verify - only offer it for an identifier this person actually
   owns, never one seen on someone else's record. This writes onto the same `identity.json`
   `use` and `on` write (under this machine's own user profile, never `.aidd/config.json`
   or `AIDD_USER_CONFIG_DIR`) — refused before there is an identity to add onto. Linking one
   already listed reports it as already listed, not as a second write.
   `aidd telemetry identity unlink <identity>` removes one identifier without touching this
   person's own identity — reports go back to counting it unresolved. Unlinking one nobody
   listed reports nothing to remove, never a failure.

## Test

| Case | Pass |
| --- | --- |
| The user agrees | `identity.json` holds a fresh `person_id` with `origin: "minted"`; the run's output says what it does and does not attach to |
| The user declines | no file is created |
| Already identified | it relays the existing identity and does not ask again |
| The user declines a display name | the identifier is still set; no display name is |
| Repository or CI cannot make this choice | `aidd telemetry identity` reads only this machine's own profile, never `.aidd/config.json` or `AIDD_USER_CONFIG_DIR` |
| A second machine takes the same identity | `identity.json` there records `origin: "adopted"`; a report folds both machines into one row |
| The identifier already in effect is taken again | reported as already in effect, writing nothing |
| An identifier this person cannot choose is linked | `identity.json`'s own `also_me` lists it; a report folds both into one row |
| An identifier already listed is linked again | reported as already listed, not written twice |
| A linked identifier is unlinked | `also_me` no longer lists it; a report counts it unresolved again |
| An unlisted identifier is unlinked | reported as nothing to remove, not as a failure |
