# Oracle : la telemetrie telle qu'elle passe sur origin/next

Releve pris sur `origin/next` (`0144ec84`) avant toute fusion, dans un worktree detache.

```
suite complete de next   304 fichiers, 3353 tests, tous verts
dont telemetrie          70 fichiers, 882 tests
dont le reste            2471 tests
```

Apres fusion, ces memes tests doivent passer **avec leurs corps inchanges**. Un import
repointe est un deplacement ; une assertion modifiee est une regression deguisee, et le
signal d'arret.

## Par fichier

| Fichier (chemin sur next) | Tests |
| ------------------------- | ----: |
| `tests/application/display/cost-report-artefact.unit.test.ts` | 19 |
| `tests/application/display/cost-report-display.unit.test.ts` | 26 |
| `tests/application/display/telemetry-check-display.unit.test.ts` | 25 |
| `tests/application/display/telemetry-display.unit.test.ts` | 23 |
| `tests/application/display/telemetry-forget-display.unit.test.ts` | 8 |
| `tests/application/use-cases/telemetry/diagnose-telemetry-use-case.unit.test.ts` | 22 |
| `tests/application/use-cases/telemetry/forget-telemetry-use-case.unit.test.ts` | 21 |
| `tests/application/use-cases/telemetry/person-identity-use-case.unit.test.ts` | 34 |
| `tests/application/use-cases/telemetry/read-local-cost-use-case.unit.test.ts` | 53 |
| `tests/application/use-cases/telemetry/report-cost-use-case.unit.test.ts` | 26 |
| `tests/application/use-cases/telemetry/telemetry-off-use-case.unit.test.ts` | 11 |
| `tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts` | 11 |
| `tests/application/use-cases/telemetry/tool-attribution.unit.test.ts` | 4 |
| `tests/domain/formats/commit-session-trailer.unit.test.ts` | 12 |
| `tests/domain/formats/local-cost-fixtures.redaction.unit.test.ts` | 7 |
| `tests/domain/models/cost-report-backlog.unit.test.ts` | 8 |
| `tests/domain/models/cost-report-envelope.unit.test.ts` | 19 |
| `tests/domain/models/cost-report-person.unit.test.ts` | 13 |
| `tests/domain/models/cost-report-task.unit.test.ts` | 11 |
| `tests/domain/models/cost-report.unit.test.ts` | 69 |
| `tests/domain/models/flow-attribution.unit.test.ts` | 20 |
| `tests/domain/models/session-project.unit.test.ts` | 5 |
| `tests/domain/models/step-attribution.unit.test.ts` | 11 |
| `tests/domain/models/task-attribution.unit.test.ts` | 21 |
| `tests/domain/models/telemetry-claim.unit.test.ts` | 44 |
| `tests/domain/models/telemetry-export-leftover.unit.test.ts` | 6 |
| `tests/domain/models/telemetry-host-registration.unit.test.ts` | 10 |
| `tests/domain/models/telemetry-removal.unit.test.ts` | 7 |
| `tests/domain/models/telemetry-setup.unit.test.ts` | 6 |
| `tests/domain/models/telemetry-sink-record.unit.test.ts` | 11 |
| `tests/domain/models/telemetry-sink-retention.unit.test.ts` | 5 |
| `tests/domain/models/telemetry-switch.unit.test.ts` | 25 |
| `tests/domain/tools/telemetry-route-supply.unit.test.ts` | 5 |
| `tests/e2e/telemetry-backlog-axis.e2e.test.ts` | 4 |
| `tests/e2e/telemetry-check-skill-commands.e2e.test.ts` | 2 |
| `tests/e2e/telemetry-check.e2e.test.ts` | 24 |
| `tests/e2e/telemetry-commit-trailer.e2e.test.ts` | 8 |
| `tests/e2e/telemetry-cost-skill-commands.e2e.test.ts` | 4 |
| `tests/e2e/telemetry-flow-axis.e2e.test.ts` | 4 |
| `tests/e2e/telemetry-forget.e2e.test.ts` | 11 |
| `tests/e2e/telemetry-hook-install.e2e.test.ts` | 1 |
| `tests/e2e/telemetry-host-registration.e2e.test.ts` | 2 |
| `tests/e2e/telemetry-identity-resolution.e2e.test.ts` | 8 |
| `tests/e2e/telemetry-identity.e2e.test.ts` | 16 |
| `tests/e2e/telemetry-init-skill-commands.e2e.test.ts` | 5 |
| `tests/e2e/telemetry-journal-gitignore.e2e.test.ts` | 2 |
| `tests/e2e/telemetry-lifecycle.e2e.test.ts` | 3 |
| `tests/e2e/telemetry-multi-tool.e2e.test.ts` | 12 |
| `tests/e2e/telemetry-on-runs-privacy.e2e.test.ts` | 7 |
| `tests/e2e/telemetry-plugin-standalone.e2e.test.ts` | 2 |
| `tests/e2e/telemetry-reference-week.e2e.test.ts` | 15 |
| `tests/e2e/telemetry-refusal.e2e.test.ts` | 7 |
| `tests/e2e/telemetry-report.e2e.test.ts` | 10 |
| `tests/e2e/telemetry-six-questions.e2e.test.ts` | 3 |
| `tests/e2e/telemetry-stored-export-record.e2e.test.ts` | 2 |
| `tests/e2e/telemetry-task-midsession.e2e.test.ts` | 3 |
| `tests/e2e/telemetry.e2e.test.ts` | 4 |
| `tests/infrastructure/adapters/copilot-cost-reader-adapter.integration.test.ts` | 4 |
| `tests/infrastructure/adapters/git-adapter-telemetry-project-id.integration.test.ts` | 1 |
| `tests/infrastructure/adapters/opencode-cost-reader-adapter.integration.test.ts` | 6 |
| `tests/infrastructure/adapters/person-identity-adapter.integration.test.ts` | 12 |
| `tests/infrastructure/adapters/person-identity-location.unit.test.ts` | 4 |
| `tests/infrastructure/adapters/run-journal-file-written.integration.test.ts` | 4 |
| `tests/infrastructure/adapters/run-journal-reader-adapter.integration.test.ts` | 26 |
| `tests/infrastructure/adapters/run-journal-task-declared.integration.test.ts` | 4 |
| `tests/infrastructure/adapters/telemetry-evidence-adapter.integration.test.ts` | 17 |
| `tests/infrastructure/adapters/telemetry-sink-adapter.integration.test.ts` | 19 |
| `tests/infrastructure/adapters/telemetry-sink-location.unit.test.ts` | 12 |
| `tests/infrastructure/adapters/transcript-cost-reader-adapter.integration.test.ts` | 7 |
| `tests/integration/telemetry-trailer-line-agrees.integration.test.ts` | 9 |

## Noms complets

Conserves pour qu'un test disparu se voie, et pas seulement un compte qui baisse.

```
# tests/application/display/cost-report-artefact.unit.test.ts
  buildCostReportArtefact labels the no-identifier row distinctly from an unresolved one
  buildCostReportArtefact lists person among the known axes
  buildCostReportArtefact names the project's switch being off in its own header, on every axis
  buildCostReportArtefact names two different causes with two different caveats
  buildCostReportArtefact prints every figure and a caveat when the identity could not be read
  buildCostReportArtefact prints every figure and a different caveat when no identity was declared at all
  buildCostReportArtefact prints no person caveat on the total axis when nobody opted in - that is the default state, not a degraded read
  buildCostReportArtefact prints one row per person with the identities behind it, mapped rows first
  buildCostReportArtefact prints two unplaced identifiers as two labelled rows, never one bucket
  buildCostReportArtefact refuses an unknown axis by name, listing the ones that exist
  buildCostReportArtefact says nothing about the switch in the header when it is on
  buildCostReportArtefact still prints the unreadable caveat on the total axis - that one is real damage
  buildCostReportArtefact — by step, two rows sharing one name carries the attribution on every row, so two rows for one step are distinguishable on their own
  buildCostReportArtefact — by step, two rows sharing one name reconciles to what the terminal prints for that step, row for row
  buildCostReportArtefact — the flow axis states its own limits with the figures names every unqualified orchestrating skill the declared set holds, whatever it holds
  buildCostReportArtefact — the flow axis states its own limits with the figures says a hand-run skill counts inside the flow it ran during
  buildCostReportArtefact — the flow axis states its own limits with the figures says a same-named skill of the reader's own project opens a flow of its own
  buildCostReportArtefact — the flow axis states its own limits with the figures says neither when the period names no flow at all - a limit that bit nothing is noise
  buildCostReportArtefact — the flow axis states its own limits with the figures states them on the flow axis alone, never on every axis
# tests/application/display/cost-report-display.unit.test.ts
  printCostReport answers the question before any breakdown is read
  printCostReport breaks a period down by tokens when no amount exists anywhere in it
  printCostReport calls a task selection's own zero rows 'nothing in this selection' too
  printCostReport calls a zero row 'nothing in this selection', never 'this period', once a filter is active
  printCostReport carries no prompt, code or diff, over records and journals that hold them
  printCostReport gives a record with no model its own row, named as unknown, rather than vanishing
  printCostReport gives a record with no project its own row, named as unknown
  printCostReport labels active time as per-session and keeps it out of every breakdown
  printCostReport names a task by its identity, never by a path it was derived from
  printCostReport names how many days a long period carries, rather than printing every row
  printCostReport names the filter that emptied a selection, and suppresses the noise under it
  printCostReport never says work ran outside every step, and never calls it a residual
  printCostReport prints a day with nothing as a row of zeros, never an omitted row
  printCostReport prints a session total on its own tool row, not 'nothing in this period' (#697)
  printCostReport prints a tool that cannot be read as not covered, with its own reason
  printCostReport prints an empty period as nothing measured, not as zeros
  printCostReport prints an unknown amount for a tool whose records carry none, never a zero
  printCostReport prints the three attribution shares together
  printCostReport says a task or a tool was never seen without claiming a record check it never ran
  printCostReport says how much of the read it could not place or could not parse
  printCostReport says which selection it answered, in the header
  printCostReport separates a tool that measured nothing from one that could not be read
  printCostReport still calls a zero row 'nothing in this period' when the whole period, not a filter, is why
  printCostReport — measurement is off names the sink's real scope, never denying the figure it sits beside
  printCostReport — measurement is off says nothing about the switch when it is on, even on an empty period
  printCostReport — measurement is off says the project's switch is off, on an empty period
# tests/application/display/telemetry-check-display.unit.test.ts
  the claims, and what is deliberately not one names a tool nothing can read with its own reason, never as a failing claim
  the claims, and what is deliberately not one prints a verdict and its detail for every claim judged
  the claims, and what is deliberately not one warns about a leftover export on stderr, on both sides of the gate
  the row saying whether commits carry their session does not excuse a shortfall when a part is broken
  the row saying whether commits carry their session keeps the count when git could not name the hooks directory
  the row saying whether commits carry their session leads with how many recent commits carry it
  the row saying whether commits carry their session names each missing piece after the count
  the row saying whether commits carry their session never excuses zero, whatever else is in place
  the row saying whether commits carry their session says a delegate that is not executable will not be run
  the row saying whether commits carry their session says a hook git will not run is not executable
  the row saying whether commits carry their session says a shortfall is expected when every part is in place
  the row saying whether commits carry their session says nothing about pieces when every piece is in place
  the row saying whether commits carry their session says the hook is somebody else's without naming a tool
  the row saying whether commits carry their session says there is no history to read rather than reporting zero
  the row saying whether commits carry their session says there is no repository rather than listing missing pieces
  the row saying whether the host will load what aidd installed names the answer and the detail on each line, never a bare pass
  the row saying whether the host will load what aidd installed orders a disabled registration and an unanswerable one between the two
  the row saying whether the host will load what aidd installed puts what will not load above what is fine
  the row saying whether the host will load what aidd installed says a project has no plugin recorded rather than printing nothing
  the row saying whether the host will load what aidd installed says the manifest could not be read, distinctly from having nothing installed
  the setup a person reads before any claim lists every location it looked in when nothing declares the recorder
  the setup a person reads before any claim names a person's own refusal rather than reporting the project as off
  the setup a person reads before any claim names a plugin version nothing journalled apart from one that was never stamped
  the setup a person reads before any claim prints the setup even when the run was gated before judging anything
  the setup a person reads before any claim reads a damaged declaration location as unreadable, not as undeclared
# tests/application/display/telemetry-display.unit.test.ts
  linking an identifier this person could not simply take as their own names the identifier it withdrew
  linking an identifier this person could not simply take as their own reports one already listed as already listed, never as a fresh write
  linking an identifier this person could not simply take as their own reports unlinking one nobody listed as nothing to remove, never a failure
  linking an identifier this person could not simply take as their own says a fresh link is a declaration nothing here can check
  the warning about where the figures land says nothing when the directory was named outright, or defaulted
  the warning about where the figures land warns when the figures were placed by the variable that also moves the token
  what `telemetry read` says about each tool gives every status a label of its own, so no two can be read as the same fact
  what `telemetry read` says about each tool leads with how many sessions it covered, not one line per tool per session
  what `telemetry read` says about each tool names a session that could not be read beside a tool that otherwise read fine
  what `telemetry read` says about each tool never says a tool found nothing when nothing was ever asked of it
  what `telemetry read` says about each tool tells a refusal apart from an empty journal
  what minting says it does, and does not do does not claim nothing changed when a display name was set alongside
  what minting says it does, and does not do names what the identifier attaches to, and what it never attaches to
  what minting says it does, and does not do reports nothing to withdraw when nobody had chosen
  what minting says it does, and does not do says a damaged file was discarded rather than left behind
  what minting says it does, and does not do says withdrawing never gives the same identifier back
  what the identity commands say names the identifier that was replaced, when one was
  what the identity commands say says records carry no person when nobody has chosen
  what the identity commands say says withdrawing takes the added identifiers with it
  what the identity commands say tells an identifier minted here from one taken from another machine
  what the switch says when it is flipped says off stops new recording only, and names what removes the rest
  what the switch says when it is flipped says the file is tracked, because turning it on decides for everyone who clones
  what the switch says when it is flipped tells an already-on project from one it just turned on
# tests/application/display/telemetry-forget-display.unit.test.ts
  what a person is shown before anything is removed counts the run files it would remove, so the count can be checked afterwards
  what a person is shown before anything is removed names history that git already holds
  what a person is shown before anything is removed says the stored records span every project measured on this machine
  what a person is shown before anything is removed says there is nothing to remove when nothing was ever measured
  what a refusal says reports nothing removed and names the flag, never a failure
  what is reported once it is done counts each location separately, so the three can be checked against the preview
  what is reported once it is done names every file it could not remove, and why
  what is reported once it is done says the switch was left alone, and how to turn measurement on again
# tests/application/use-cases/telemetry/diagnose-telemetry-use-case.unit.test.ts
  DiagnoseTelemetryUseCase — a leftover export config is reported alongside the four claims when the switch is on
  DiagnoseTelemetryUseCase — a leftover export config is reported even when the switch is off and the run is gated
  DiagnoseTelemetryUseCase — a leftover export config reports an empty list on a clean machine, never omitting the field
  DiagnoseTelemetryUseCase — every claim is judged never lets absent evidence produce an ok: no claim is ever left unjudged
  DiagnoseTelemetryUseCase — gathering local evidence names a reader that threw as failing to read, never crashing the whole diagnostic
  DiagnoseTelemetryUseCase — gathering local evidence names every uncovered tool with its own reason
  DiagnoseTelemetryUseCase — gathering local evidence only consults Codex's own hook trust for a Codex-anchored session
  DiagnoseTelemetryUseCase — gathering local evidence reads every covered tool's own files for every journalled session
  DiagnoseTelemetryUseCase — gating names a non-repository, never blaming the hook, once the switch is on
  DiagnoseTelemetryUseCase — gating stops at the switch before judging anything else
  DiagnoseTelemetryUseCase — the first claim reads the same declaration setup prints fails, naming the recorder, when the setup's own recorder declaration is false
  DiagnoseTelemetryUseCase — the first claim reads the same declaration setup prints reads unknown, never a failure, when the setup's own recorder declaration could not be read
  DiagnoseTelemetryUseCase — the first claim reads the same declaration setup prints reports nothing to evaluate when the setup's own recorder declaration is true
  DiagnoseTelemetryUseCase — what the host will actually load cannot ask any registry about a plugin recorded without a marketplace
  DiagnoseTelemetryUseCase — what the host will actually load says a plugin the host's registry carries is registered
  DiagnoseTelemetryUseCase — what the host will actually load says a plugin the registry lacks is not registered, and names the file
  DiagnoseTelemetryUseCase — what the host will actually load survives a manifest it cannot parse, and says so instead of dying
  the versions check reports names this CLI's own version, which a person always has since nothing reads without it
  the versions check reports reports the newest, so an upgrade mid-period is not hidden by the sessions before it
  the versions check reports reports the plugin version the hook itself stamped, never one re-derived here
  the versions check reports skips a session carrying no version rather than letting it hide a later one that does
  the versions check reports tells a project that measured nothing yet apart from one whose hook could not name itself
# tests/application/use-cases/telemetry/forget-telemetry-use-case.unit.test.ts
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched a machine where nothing was ever measured has nothing to remove, and offers nothing
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched asks listTrackedFiles and hasHistoryFor about the journal's own pathspec
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched names the journal as this project's own, at its own resolved path
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched names the sink as this machine's own, spanning whatever it holds
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reads a non-repository as no history at all, never as a possibility
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reads a staged-but-never-committed journal honestly — tracked, not certainly held
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reads an untracked journal as possible, never as an all-clear
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reads history at its true strength: committed reads as certain
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reports a damaged identity file as present, not absent
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reports an opted-in identity as present
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched reports no identity at all as absent
  ForgetTelemetryUseCase.preview() — every location, resolved once, and nothing touched touches nothing: previewing leaves the sink, the journal and the identity exactly as they were
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution a journal run file that refuses removal is reported, and the sink still empties
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution a location that refuses removal is reported, and every other location is still emptied
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution an identity that refuses removal is reported, and the other locations still empty
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution never touches an identity that was not shown in the preview — the gate on preview.identity.present
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution proves the guarantee by mutation for the identity: removal acts on the preview's own path, never the store's own resolution
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution proves the guarantee by mutation for the journal: removal acts on the preview's own directory, never the reader's own resolution
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution proves the guarantee by mutation: removal acts on the preview's own names, never a fresh directory listing
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution removes exactly the run files, day files and identity the preview named, and reports matching counts
  ForgetTelemetryUseCase.remove() — acts on the value preview() produced, never its own resolution repeats history unchanged after removing — history is not made reachable by removing the rest
# tests/application/use-cases/telemetry/person-identity-use-case.unit.test.ts
  PersonIdentityUseCase.link adds the identifier onto this person
  PersonIdentityUseCase.link refuses an empty or whitespace-only identifier, writing nothing
  PersonIdentityUseCase.link refuses when nobody opted in, naming the missing step
  PersonIdentityUseCase.link reports an identifier already listed as already listed, not as a second write
  PersonIdentityUseCase.link reports the person's own identifier as already listed, and appends nothing onto alsoMe
  PersonIdentityUseCase.off discards a damaged identity file rather than leaving a person unable to withdraw
  PersonIdentityUseCase.off does nothing when already off
  PersonIdentityUseCase.off opting in again after withdrawing mints a fresh identifier, never the old one back
  PersonIdentityUseCase.off removes a file that exists but names nobody, rather than reading it as already off
  PersonIdentityUseCase.off removes the whole declaration, stating how many added identifiers went with it
  PersonIdentityUseCase.off states that new records will carry no person, and removes the file
  PersonIdentityUseCase.off still throws off's own way for anything that is not the store's own unreadable error
  PersonIdentityUseCase.status answers an identity with a name
  PersonIdentityUseCase.status answers an identity with no name and no added identifiers
  PersonIdentityUseCase.status answers no identity when nobody opted in
  PersonIdentityUseCase.status lists every identifier added onto this person, including how it was obtained
  PersonIdentityUseCase.status throws, never answers 'no identity', when the store cannot be read
  PersonIdentityUseCase.unlink reports nothing to remove for an empty identifier, never as a failure - link already refuses to write one
  PersonIdentityUseCase.unlink reports nothing to remove for an identifier nobody listed, and exits successfully
  PersonIdentityUseCase.unlink reports nothing to remove when nobody opted in at all - off already took the alsoMe list with it
  PersonIdentityUseCase.unlink withdraws an identifier from this person
  PersonIdentityUseCase.use keeps alsoMe already declared when adopting a different identifier
  PersonIdentityUseCase.use refuses an empty or whitespace-only identifier, writing nothing
  PersonIdentityUseCase.use replaces a different identifier, naming what it replaced
  PersonIdentityUseCase.use reports the identifier already in effect, and writes nothing
  PersonIdentityUseCase.use takes an identifier minted elsewhere, recording it as adopted
  PersonIdentityUseCase.use, attaching a display name attaches the display name beside the identifier already opted into
  PersonIdentityUseCase.use, attaching a display name mints an identifier for a name given when none stands, rather than refusing
  PersonIdentityUseCase.use, attaching a display name refuses an empty or whitespace-only value
  PersonIdentityUseCase.use, minted apart from adopted calls a fresh identifier minted, and one carried here adopted
  PersonIdentityUseCase.use, minted apart from adopted calls replacing one identifier with another adopted, never minted
  PersonIdentityUseCase.use, settling which identifier stands a second on reports the same identifier, never a new one
  PersonIdentityUseCase.use, settling which identifier stands mints an identifier when none exists
  what the errors tell a person to run names no identity verb the command surface does not have
# tests/application/use-cases/telemetry/read-local-cost-use-case.unit.test.ts
  ReadLocalCostUseCase a Codex turn read while it runs is not the last word lands the completed figures even once the run journal's own turn_end has been seen
  ReadLocalCostUseCase a Codex turn read while it runs is not the last word lands the completed figures once the rest of the turn arrives
  ReadLocalCostUseCase a Codex turn read while it runs is not the last word never lets a later, smaller reading of the same turn replace the larger one
  ReadLocalCostUseCase a Codex turn read while it runs is not the last word stops re-appending once a re-read brings nothing new
  ReadLocalCostUseCase carries a covered tool's stated limitation through to the report, since a source comment reaches nobody
  ReadLocalCostUseCase carries a display name alongside the identifier, never in its place
  ReadLocalCostUseCase distinguishes not-covered from covered-and-empty
  ReadLocalCostUseCase forbids a reader from naming its own tool, at compile time
  ReadLocalCostUseCase invents no limitation for a covered tool that declares none
  ReadLocalCostUseCase leaves a session stored before opting in unnamed, even on a later read
  ReadLocalCostUseCase leaves the store byte-identical on a second read of the same session
  ReadLocalCostUseCase never re-appends a kind: 'session' record sharing a turn_id, even once corrections exist for kind: 'request'
  ReadLocalCostUseCase never synthesises a key for a candidate with no request identifier, and cannot dedup it
  ReadLocalCostUseCase project attribution falls back to the directory-name field with no remote, and says so
  ReadLocalCostUseCase project attribution prefers the remote, and says so
  ReadLocalCostUseCase project attribution stores no project for a session with no journal at all
  ReadLocalCostUseCase reports a tool with no declared local read as not-covered, with its declared reason
  ReadLocalCostUseCase reports an unmeasured tool as not-covered with no reason invented for it
  ReadLocalCostUseCase stamps no cli_version at all when no version reader was given - never a guessed default
  ReadLocalCostUseCase stamps no person field when nobody opted in - the default
  ReadLocalCostUseCase stamps the CLI's own version on the record it stores, read through the version port
  ReadLocalCostUseCase stamps the identifier a person chose, and a display name only once they set one
  ReadLocalCostUseCase stamps the tool it asked
  ReadLocalCostUseCase step attribution carries a tool-stated plugin alongside its step
  ReadLocalCostUseCase step attribution derives a step from a journal interval when the tool states none
  ReadLocalCostUseCase step attribution prefers the tool's own stated step over a journal interval that also covers it
  ReadLocalCostUseCase step attribution reads a record as unattributed when neither the tool nor a journal can say
  ReadLocalCostUseCase step attribution stores a tool-stated step, marked as stated by the tool
  ReadLocalCostUseCase step attribution yields identical counters whether a journal is present or not
  ReadLocalCostUseCase stores a found session's counters in the stored shape, marked as read locally
  ReadLocalCostUseCase stores what a partial read returns without erroring, when a session is still in progress
  a failure in a sweep does not disappear behind a success counts no failure when every session read cleanly
  a failure in a sweep does not disappear behind a success prunes day files outside the retention window, once per sweep
  a failure in a sweep does not disappear behind a success reports its figures even when a day file cannot be deleted
  a failure in a sweep does not disappear behind a success reports the tool as read, and still says how many sessions it could not read
  a reader that fails claims no zero when every reader fails
  a reader that fails costs its own tool's figures and no other tool's
  a reader that fails is a fifth answer, never one of the four that already exist
  a reader that fails says the tool could not be read, and why, in the reader's own words
  a reader that fails stores what a failed read missed, once the reader recovers
  a refusal holds on the one writer left reads nothing and stores nothing when the project switch is off
  a refusal holds on the one writer left refuses even a direct --session read, which never touches the journal
  reading every session the journal knows keeps reading the other sessions when one session's reader throws
  reading every session the journal knows reads every journalled session when none is named
  reading every session the journal knows reads nothing, without failing, when the journal names no session
  reading every session the journal knows reads only the session named, when one is
  reading every session the journal knows stores nothing new on a second sweep
  reading every session the journal knows sums a tool's counts across the sweep and keeps its strongest answer
  which readers a session reaches asks every reader when no journal names a tool, since then none is ruled out
  which readers a session reaches asks every reader when the journal names a host no tool claims
  which readers a session reaches asks only the reader the journal named, and says so about the ones it skipped
  which readers a session reaches never reports a skipped reader as having found no session
  which readers a session reaches still names a tool nothing can read, with its own declared reason, whoever the session belongs to
# tests/application/use-cases/telemetry/report-cost-use-case.unit.test.ts
  ReportCostUseCase answers an empty period with an empty report and no error
  ReportCostUseCase gives every declared tool a row, with the reason an unreadable one cannot be read
  ReportCostUseCase leaves out work that happened before the period, however recently it was stored
  ReportCostUseCase names no tool, by string literal
  ReportCostUseCase re-throws an error it does not recognise rather than mislabelling it as a named cause
  ReportCostUseCase reports a period from what the sink holds, whatever session it belongs to
  ReportCostUseCase reports a period whose sessions have no journal at all
  ReportCostUseCase reports no identity declared as its own cause, distinct from unreadable
  ReportCostUseCase reports the switch as on when the evidence reader says so, even with nothing measured
  ReportCostUseCase reports what the read could not place or could not parse
  ReportCostUseCase reports whether the project switch is on, from the evidence reader alone
  ReportCostUseCase resolves byPeople against the identity this store holds
  ReportCostUseCase resolves the declaration through TaskBacklogReader, keyed on the folder the task identity resolves to
  ReportCostUseCase restricts to the sessions that wrote into the task asked for
  ReportCostUseCase survives an identity that cannot be read, reporting every figure with the caveat set
  a report that catches the sink up first deletes no stored day file, since a question is not housekeeping
  a report that catches the sink up first leaves a session already stored alone rather than reading it again
  a report that catches the sink up first never reaches for a session journalled the instant the period ends
  a report that catches the sink up first never reaches for a session whose own moment falls outside the period asked about
  a report that catches the sink up first opens no tool's files at all when the project switch is off
  a report that catches the sink up first reaches a session journalled at the very first instant of the period
  a report that catches the sink up first reaches a session journalled on the last day of the period, which runs to midnight
  a report that catches the sink up first reports a journalled session nobody ran a read for
  a report that catches the sink up first reports only what the sink holds when no read was wired, rather than guessing
  a report that catches the sink up first says what a reader could not answer, rather than reporting the silence as no spend
  a report that catches the sink up first skips a journal whose own moment cannot be read at all, rather than treating it as now
# tests/application/use-cases/telemetry/telemetry-off-use-case.unit.test.ts
  TelemetryOffUseCase — an endpoint configuration is untouched leaves a tool's settings file exactly as `endpoint <url>` wrote it
  TelemetryOffUseCase — names a leftover export it cannot clear warns nothing when no leftover export is found
  TelemetryOffUseCase — names a leftover export it cannot clear warns with the file and the keys still set, when one is found
  TelemetryOffUseCase — never on prints the resolved switch path even when there is nothing to do
  TelemetryOffUseCase — never on succeeds and changes nothing when the project was never on
  TelemetryOffUseCase — taking back what on installed asks git to remove the delegate, whatever the switch's previous state was
  TelemetryOffUseCase — taking back what on installed says new commits carry nothing, and that the old ones keep theirs
  TelemetryOffUseCase — taking back what on installed says nothing when there was nothing installed to take back
  TelemetryOffUseCase — the switch does not delete the switch file — deleting it would lose the endpoint
  TelemetryOffUseCase — the switch reports unchanged when the switch was already off
  TelemetryOffUseCase — the switch sets enabled: false, preserving the endpoint the project chose
# tests/application/use-cases/telemetry/telemetry-on-use-case.unit.test.ts
  TelemetryOnUseCase — making commits joinable to the session that made them installs on every successful on, so a project turned on before this is caught up
  TelemetryOnUseCase — making commits joinable to the session that made them installs the delegate the domain declares, never a script written out a second time
  TelemetryOnUseCase — making commits joinable to the session that made them says nothing when it was already installed - a no-op is not news
  TelemetryOnUseCase — making commits joinable to the session that made them says what it will write into commit messages, and how to undo it
  TelemetryOnUseCase — the same consent `endpoint --scope project` already demands fires even when the switch is already on — the same unconditional guard `endpoint` uses
  TelemetryOnUseCase — the same consent `endpoint --scope project` already demands with --yes, writes the switch
  TelemetryOnUseCase — the same consent `endpoint --scope project` already demands without --yes, refuses and writes nothing, naming the consequence
  TelemetryOnUseCase — the switch alone enabling twice reports the switch unchanged the second time
  TelemetryOnUseCase — the switch alone preserves an endpoint already recorded in the switch file — `on` has no opinion on it
  TelemetryOnUseCase — the switch alone prints the resolved switch path before writing anything
  TelemetryOnUseCase — the switch alone succeeds with no endpoint anywhere, and writes no tool's settings file
# tests/application/use-cases/telemetry/tool-attribution.unit.test.ts
  every stored record names its tool contains no tool name, by string literal, in the local-read use-case
  every stored record names its tool names a tool on every record produced from a captured transcript
  every stored record names its tool names only a declared tool identifier, never a free string
  every stored record names its tool names the tool consistently, and the vendor field it read the identity from
# tests/domain/formats/commit-session-trailer.unit.test.ts
  the delegate a commit's message actually passes through names the commands that install and remove it, where a person will look
  the delegate a commit's message actually passes through needs nothing but a shell and git - it runs neither node nor this CLI
  the delegate a commit's message actually passes through never fails a commit: every path out of it exits zero
  the delegate a commit's message actually passes through reads Codex's own variable before Claude Code's, the precedence session-anchor.ts measured
  the delegate a commit's message actually passes through skips a merge and a squash, so one commit never claims the work it brings in
  the delegate a commit's message actually passes through writes nothing when no session made the commit - an unknown is never a guess
  the delegate a commit's message actually passes through writes the trailer once however often it runs, amend included
  the line added to a repository's own prepare-commit-msg forwards git's own arguments, so the delegate can tell a merge from an authored commit
  the line added to a repository's own prepare-commit-msg leaves a POSIX path exactly as it was
  the line added to a repository's own prepare-commit-msg quotes the path, so a checkout living under a directory with a space still runs
  the line added to a repository's own prepare-commit-msg writes a Windows path with forward slashes, which is the only form sh resolves
  what the delegate is called on disk is named for what it does, and is a shell script
# tests/domain/formats/local-cost-fixtures.redaction.unit.test.ts
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .claude/projects/fake-project/22222222-2222-4222-8222-222222222222.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .claude/projects/fake-project/22222222-2222-4222-8222-222222222222/subagents/agent-aa81cdef3bb58820c.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .codex/sessions/2026/07/16/rollout-2026-07-16T09-25-07-019f69d0-9e1f-7951-86c9-ddb23cfd51f4.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .codex/sessions/2026/07/29/rollout-2026-07-29T17-12-26-019fae6f-2009-7cd3-86b2-b8f83481b160.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .copilot/session-state/33333333-3333-4333-8333-333333333333/events.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content .copilot/session-state/44444444-4444-4444-8444-444444444444/events.jsonl carries no forbidden key, absolute path, email, or oversized string
  tests/fixtures/local-cost — no fixture carries prompt, response, or file content finds at least the four known fixtures — the scan itself is not vacuous
# tests/domain/models/cost-report-backlog.unit.test.ts
  buildCostReport — by_backlog regroups tasks by what their folder declares a task with no entry in the resolved declarations still counts, defaulting to none rather than dropping the record
  buildCostReport — by_backlog regroups tasks by what their folder declares carries a record in no task at all through as its own reason row, unchanged
  buildCostReport — by_backlog regroups tasks by what their folder declares gives a damaged declaration its own row, costing only its own resolution
  buildCostReport — by_backlog regroups tasks by what their folder declares gives a task declaring none its own row, distinct from a record in no task at all
  buildCostReport — by_backlog regroups tasks by what their folder declares merges two tasks declaring the same item into one row
  buildCostReport — by_backlog regroups tasks by what their folder declares mutation proof: a task declaring no item is never silently merged into one that declared
  buildCostReport — by_backlog regroups tasks by what their folder declares orders named items largest first, then none, then unreadable, then every reason
  buildCostReport — by_backlog regroups tasks by what their folder declares reconciles to the same total as the task, step, model, person and project axes
# tests/domain/models/cost-report-envelope.unit.test.ts
  the two renderings are one computation prints the figures the object carries, from the same report value
  the two renderings are one computation takes the same value on both sides, so neither can see a figure the other cannot
  toCostReportEnvelope carries a version a consumer can refuse
  toCostReportEnvelope carries all three attribution strengths, strongest first, zeros included
  toCostReportEnvelope carries every day the period spans, a gap included, never sorted by size
  toCostReportEnvelope carries measurement_enabled, the one field the terminal rendering could see and this could not
  toCostReportEnvelope carries money as whole micro-dollars, so summing reports stays exact
  toCostReportEnvelope carries no filters object at all for an unfiltered period
  toCostReportEnvelope carries only the generic filters given, snake_case field names untouched
  toCostReportEnvelope carries session_totals snake_case, beside the ordinary totals, only where measured (#697)
  toCostReportEnvelope carries the period absolutely, as it resolved
  toCostReportEnvelope carries what the read could not place and could not parse
  toCostReportEnvelope carries why an uncovered tool cannot be read
  toCostReportEnvelope gives a record with no project its own row, project absent rather than a placeholder
  toCostReportEnvelope keeps an absent counter absent, never turning it into a zero
  toCostReportEnvelope names the filter that emptied a selection, distinguishing known from never seen
  toCostReportEnvelope reads no clock and no filesystem
  toCostReportEnvelope says what each tool can supply on each route, from its declaration
  toCostReportEnvelope serializes an empty period to a valid object rather than to nothing
# tests/domain/models/cost-report-person.unit.test.ts
  byPeople — a billed call seen by both routes keeps its person backfills the local-read sibling's person_id onto the export-route survivor
  byPeople — no mapping declared at all carries identityUnusableCause through when the caller states it
  byPeople — no mapping declared at all identityUnusableCause is absent when nothing said otherwise
  byPeople — no mapping declared at all resolves every identifier as unresolved, and leaves the figures unchanged
  byPeople — one raw identity resolved per group, never merged or dropped a mapped row names every raw identity behind it
  byPeople — one raw identity resolved per group, never merged or dropped a record with no identifier lands in its own row, distinct from every unresolved one
  byPeople — one raw identity resolved per group, never merged or dropped an identity nobody declared gets its own row, labelled unresolved
  byPeople — one raw identity resolved per group, never merged or dropped orders mapped rows first, then unresolved, then the no-identifier row last
  byPeople — one raw identity resolved per group, never merged or dropped summing every person row's own money and tokens equals the report's own total
  byPeople — one raw identity resolved per group, never merged or dropped summing every person row's requests equals the report's own total
  byPeople — one raw identity resolved per group, never merged or dropped two identifiers nobody declared produce two rows, never one merged bucket
  byPeople — one raw identity resolved per group, never merged or dropped two identifiers one person declared produce one row, not two
  the envelope carries by_person for a program to parse carries the person rows, their identities, and a raised report version
# tests/domain/models/cost-report-task.unit.test.ts
  buildCostReport — by_task groups by the declared interval a record falls in answers all six questions over one period, each reconciling to the same total
  buildCostReport — by_task groups by the declared interval a record falls in carries the attribution a closed interval always rests on
  buildCostReport — by_task groups by the declared interval a record falls in counts each record once, in exactly one row, when a session declares twice
  buildCostReport — by_task groups by the declared interval a record falls in gives one row per task declared in the period
  buildCostReport — by_task groups by the declared interval a record falls in holds everything in the no-task row when nothing was ever declared, and still reconciles
  buildCostReport — by_task groups by the declared interval a record falls in never contradicts a --task header: the inferred route's own record still names no declared interval
  buildCostReport — by_task groups by the declared interval a record falls in never lets the whole-session written-path inference the --task filter uses leak into this breakdown
  buildCostReport — by_task groups by the declared interval a record falls in places a record before any declaration in its own row, never dropped
  buildCostReport — by_task groups by the declared interval a record falls in resolves a declared interval whose path merely contains '..' as text, never misreading live coverage as journal-silent
  buildCostReport — by_task groups by the declared interval a record falls in sorts named tasks largest first, with the no-task row placed last regardless of size
  buildCostReport — by_task groups by the declared interval a record falls in sums the task rows back to the same period total as every other breakdown
# tests/domain/models/cost-report.unit.test.ts
  buildCostReport — a line on disk holds whatever it holds, not what a type declares ignores an active time that is not a number, rather than adding it
  buildCostReport — a line on disk holds whatever it holds, not what a type declares leaves a null active time unobserved, rather than counting it as a zero
  buildCostReport — a line on disk holds whatever it holds, not what a type declares still sums the active times that are numbers
  buildCostReport — a local-read session total, the first kind: 'session' report figure (#697) carries a session total on the tool's own row, never on the period total
  buildCostReport — a local-read session total, the first kind: 'session' report figure (#697) never enters by_step or by_day — it reconciles with neither
  buildCostReport — a local-read session total, the first kind: 'session' report figure (#697) never folds an export-route session delta into the by-tool session total
  buildCostReport — a local-read session total, the first kind: 'session' report figure (#697) stays off every row for a tool with no session-kind local-read record
  buildCostReport — a still-open local-read turn is superseded, never doubled answers the same whichever order the two readings arrive in
  buildCostReport — a still-open local-read turn is superseded, never doubled keeps the larger reading, and does not sum the two into a figure neither reported
  buildCostReport — a still-open local-read turn is superseded, never doubled never collapses a kind: 'session' record sharing a turn_id (Copilot's shutdown total)
  buildCostReport — a still-open local-read turn is superseded, never doubled never collapses the export route's own turn_id, which several billed calls share
  buildCostReport — a still-open local-read turn is superseded, never doubled never lets a smaller reading of the same turn win, in either arrival order
  buildCostReport — a still-open local-read turn is superseded, never doubled prefers an observed zero over an unmentioned counter when two readings tie on weight
  buildCostReport — a task can be declared, not just derived a declaration left open by one session does not reach a later, unrelated one
  buildCostReport — a task can be declared, not just derived a declared interval closes at its own bound - work after it falls back to inferred
  buildCostReport — a task can be declared, not just derived a session that never declared and never wrote into the folder belongs to none - never the last one seen
  buildCostReport — a task can be declared, not just derived an unclosed declaration is capped at the journal's own last recorded moment, never left boundless
  buildCostReport — a task can be declared, not just derived attributes a tool whose payloads name no path at all - a declared interval, never a written file
  buildCostReport — a task is a filter over a period attaches a session that wrote into no task folder to no task at all
  buildCostReport — a task is a filter over a period counts a session with no journal in the period, unattributed to any task
  buildCostReport — a task is a filter over a period counts every session when no task is asked for, journalled or not
  buildCostReport — a task is a filter over a period counts only the sessions that wrote into the task asked for
  buildCostReport — an absent quantity stays absent gives a covered tool that did nothing a row of its own, not silence
  buildCostReport — an absent quantity stays absent keeps a counter observed as zero distinct from one never observed
  buildCostReport — an absent quantity stays absent reports no amount for a tool whose records carry none, never a zero
  buildCostReport — an unknown keeps its row, never a zero gives a damaged moment no day row, while the total still holds it
  buildCostReport — an unknown keeps its row, never a zero gives a record with no model its own row in byModels, and it still reconciles
  buildCostReport — an unknown keeps its row, never a zero reads a non-numeric cost as unknown, never as a zero
  buildCostReport — any dimension filters as well as it groups drops a session-only figure a model filter cannot speak to, never as a false zero
  buildCostReport — any dimension filters as well as it groups filtering and grouping on the same single-keyed dimension answers with one row
  buildCostReport — any dimension filters as well as it groups keeps a session-only figure under a step filter when a journal interval stamped one
  buildCostReport — any dimension filters as well as it groups names the combination, not either filter alone, when both are real but their overlap is empty
  buildCostReport — any dimension filters as well as it groups names the filter that emptied a selection a project nobody ever worked in
  buildCostReport — any dimension filters as well as it groups narrows two filters to their intersection, never their union
  buildCostReport — any dimension filters as well as it groups never reports a filter as the culprit when the period itself has nothing
  buildCostReport — any dimension filters as well as it groups reconciles every breakdown to this selection's own total, exactly
  buildCostReport — any dimension filters as well as it groups says a tool was never seen without claiming a record check it never ran
  buildCostReport — any dimension filters as well as it groups says which selection it answered
  buildCostReport — any dimension filters as well as it groups tells that empty apart from a known value with no work in this period
  buildCostReport — by day and by project gives a record with no project its own row, named as unknown
  buildCostReport — by day and by project gives every day in the period a row, a gap included, and reconciles to the total
  buildCostReport — by day and by project never folds a record with no project into a neighbour's row
  buildCostReport — by day and by project treats an empty-string project_id the same as no project at all
  buildCostReport — by_flow reads the journal's own sequence, nothing declared gives a session that never ran an orchestrating skill exactly one row, outside every flow, total intact
  buildCostReport — by_flow reads the journal's own sequence, nothing declared gives two orchestrated runs of the same skill in one session two rows, never one merged by name
  buildCostReport — by_flow reads the journal's own sequence, nothing declared gives work before the first orchestrating step its own row, outside any flow
  buildCostReport — by_flow reads the journal's own sequence, nothing declared holds nothing, and says so rather than swallowing later work, for a flow opened at the journal's very last moment
  buildCostReport — by_flow reads the journal's own sequence, nothing declared opens no flow for a skill outside the declared set, however plausible its name
  buildCostReport — by_flow reads the journal's own sequence, nothing declared puts a hand-run skill's cost inside the flow it ran during - the journal cannot tell it apart from one the orchestrator invoked
  buildCostReport — by_flow reads the journal's own sequence, nothing declared puts the outside-every-flow row last even when it is the largest - the tail convention by_task and by_backlog already keep
  buildCostReport — by_flow reads the journal's own sequence, nothing declared reconciles by_flow to the same total as every other breakdown
  buildCostReport — every breakdown reconciles keeps one skill reached both ways as two rows, never merged into one claim
  buildCostReport — every breakdown reconciles names what nothing could attribute as unattributed, with no step of its own
  buildCostReport — every breakdown reconciles orders by tokens where no amount exists, so an amount-less tool is not sorted as free
  buildCostReport — every breakdown reconciles orders each breakdown largest first, so the biggest thing is read first
  buildCostReport — every breakdown reconciles splits the total three ways by how strongly each part was attributed
  buildCostReport — every breakdown reconciles sums each breakdown exactly back to the total it belongs to
  buildCostReport — every breakdown reconciles weighs a costless row by all four counters, cache included - not input and output alone
  buildCostReport — one billed call, seen by both routes, counts once collapses the two routes' records for the same call into one, in the built report
  buildCostReport — one billed call, seen by both routes, counts once sums a naive union of both routes' records to double — the reproduced defect
  buildCostReport — the same records, however they arrive keeps the same order when two rows carry equal weight
  buildCostReport — the same records, however they arrive produces a byte-identical report from the records reversed
  buildCostReport — the same records, however they arrive produces a byte-identical report twice from the same records
  buildCostReport — the two kinds are never summed reports no active time at all, rather than zero, when no record carried it
  buildCostReport — the two kinds are never summed takes active time from session records alone, and never breaks it down by step
  buildCostReport — the two kinds are never summed takes money and tokens from request records alone
  buildCostReport — what it says about itself answers an empty period with an empty report, never an error
  buildCostReport — what it says about itself carries the undated and unreadable counts through to the caller
  buildCostReport — what it says about itself names no tool and no skill, by string literal
# tests/domain/models/flow-attribution.unit.test.ts
  ORCHESTRATING_SKILLS — declared once, both capture spellings hands out a project's fourth orchestrator too, without anything else being told about it
  ORCHESTRATING_SKILLS — declared once, both capture spellings hands out the unqualified spellings alone, sorted - the ones a project can collide with
  ORCHESTRATING_SKILLS — declared once, both capture spellings matches no plugin name in passing - nothing here reads a prefix or a substring
  ORCHESTRATING_SKILLS — declared once, both capture spellings names every orchestrator skill, in the argument spelling and the bare directory spelling
  buildFlowIntervals — a journal with no readable moment in it builds nothing from a journal with no boundary at all
  buildFlowIntervals — a journal with no readable moment in it builds nothing when every moment it holds is unparseable - never an interval bounded by NaN
  buildFlowIntervals — a journal with no readable moment in it ends a flow nothing ever closed at the journal's own last witnessed moment
  buildFlowIntervals — pure: journal lines -> bounded flow intervals caps an unclosed flow at its own moment, never at Infinity
  buildFlowIntervals — pure: journal lines -> bounded flow intervals clamps an unclosed flow's end to the report's own period end, never past a clock-skewed future moment
  buildFlowIntervals — pure: journal lines -> bounded flow intervals closes a flow at turn_end when nothing else orchestrates first
  buildFlowIntervals — pure: journal lines -> bounded flow intervals closes at the turn_end itself, not at whatever the journal witnessed after it
  buildFlowIntervals — pure: journal lines -> bounded flow intervals declares no flow interval at all for a session that never ran an orchestrating skill
  buildFlowIntervals — pure: journal lines -> bounded flow intervals leaves work done after the turn ended outside the flow that turn opened
  buildFlowIntervals — pure: journal lines -> bounded flow intervals matches the bare directory spelling a Cursor or Codex payload actually writes
  buildFlowIntervals — pure: journal lines -> bounded flow intervals never lets a hand-run, non-orchestrating step_start close an open flow
  buildFlowIntervals — pure: journal lines -> bounded flow intervals opens a flow at an orchestrating step_start and closes it at the next one
  buildFlowIntervals — pure: journal lines -> bounded flow intervals opens two distinct intervals for the same skill run twice in one session, never merged into one
  buildFlowIntervals — pure: journal lines -> bounded flow intervals touches no filesystem — the module imports none of Node's fs APIs
  buildFlowIntervals — pure: journal lines -> bounded flow intervals widens an unclosed flow's end to the journal's own last witnessed moment - a file written after it, no turn_end yet
  buildFlowIntervals — the limit the flow axis prints beside its figures opens a flow on a bare 01-sdlc, whichever project's own skills/ directory named it
# tests/domain/models/session-project.unit.test.ts
  resolveSessionProject falls back to the directory-name field when no remote exists
  resolveSessionProject names no project for a journal with no session at all
  resolveSessionProject names no project for a session with no journal at all
  resolveSessionProject names no project when the session carries neither field
  resolveSessionProject prefers the remote, and says so
# tests/domain/models/step-attribution.unit.test.ts
  buildStepIntervals — a step the session never closed attributes a much later moment to it, which is what leaving it open means
  buildStepIntervals — a step the session never closed leaves the last step open when no turn_end ever closed it
  step-attribution — pure: journal lines + records -> intervals closes an interval at the next step_start, not at the turn's end past it
  step-attribution — pure: journal lines + records -> intervals closes the last step at its own turn_end, leaving nothing beyond it covered
  step-attribution — pure: journal lines + records -> intervals does not let an unparseable boundary extend the step before it into the step after
  step-attribution — pure: journal lines + records -> intervals maps a moment inside a step interval to that step, marked as derived
  step-attribution — pure: journal lines + records -> intervals reads a moment before the first boundary as unattributed, never folded into it
  step-attribution — pure: journal lines + records -> intervals reads a record with no moment at all as unattributed, never the first interval
  step-attribution — pure: journal lines + records -> intervals reads every moment as unattributed when the journal opened no step
  step-attribution — pure: journal lines + records -> intervals touches no filesystem — the module imports none of Node's fs APIs
  step-attribution — pure: journal lines + records -> intervals yields three intervals and two names from A, then B, then A
# tests/domain/models/task-attribution.unit.test.ts
  task-attribution — pure: journal lines -> bounded intervals caps an unclosed declaration at its own moment, never at Infinity
  task-attribution — pure: journal lines -> bounded intervals caps an unclosed declaration at the last boundary the journal actually recorded
  task-attribution — pure: journal lines -> bounded intervals clamps an unclosed interval's end to the report's own period end, never past it
  task-attribution — pure: journal lines -> bounded intervals closes a declaration at a later declaration, never at the turn's own end past it
  task-attribution — pure: journal lines -> bounded intervals closes a declared interval at the turn_end that follows it
  task-attribution — pure: journal lines -> bounded intervals declares no interval at all for a journal that never named a task
  task-attribution — pure: journal lines -> bounded intervals drops a task_declared line whose own `at` this reader cannot parse, the same as one that was never written
  task-attribution — pure: journal lines -> bounded intervals emits no interval for a declared path this reader cannot turn into an identity, but still lets it close the interval before it
  task-attribution — pure: journal lines -> bounded intervals leaves an unclosed interval's end exactly where a real closer put it, when that is well inside the period
  task-attribution — pure: journal lines -> bounded intervals never lets a step_start close a declared interval early - only task_declared and turn_end do
  task-attribution — pure: journal lines -> bounded intervals never lets a written file reach further back than the interval's own last closer
  task-attribution — pure: journal lines -> bounded intervals reads a moment inside the interval as covered, and one outside as not
  task-attribution — pure: journal lines -> bounded intervals reads a record with no moment, or an unparseable one, as not covered
  task-attribution — pure: journal lines -> bounded intervals still never runs away: a written file does not turn the interval open-ended
  task-attribution — pure: journal lines -> bounded intervals touches no filesystem — the module imports none of Node's fs APIs
  task-attribution — pure: journal lines -> bounded intervals widens an unclosed declaration's end to a written file the journal witnessed after it
  taskUnattributedReason — which of three distinct facts applies names journal-silent for a record after the last declared interval's own end
  taskUnattributedReason — which of three distinct facts applies names journal-silent for a record with no moment, once a task was declared
  taskUnattributedReason — which of three distinct facts applies names no-declaration for a session whose journal never declared a task
  taskUnattributedReason — which of three distinct facts applies names precedes-declaration for a record before the session's only declaration
  taskUnattributedReason — which of three distinct facts applies names precedes-declaration for a record in the gap a turn_end leaves before the next declaration - never journal-silent, since the journal keeps going right through it
# tests/domain/models/telemetry-claim.unit.test.ts
  diagnoseTelemetryClaims — hook fired cannot tell whether this session's hook fired without an anchor
  diagnoseTelemetryClaims — hook fired does not read a torn run file (session-less) as an unrecognised payload without the marker
  diagnoseTelemetryClaims — hook fired lets an untrusted Codex hook explain the absence ahead of either new reason, even when the recorder is declared
  diagnoseTelemetryClaims — hook fired names an anchorless run file as its own reason, unconditional on the recorder's own declaration
  diagnoseTelemetryClaims — hook fired names an unrecognised payload as its own fault, distinct from never firing
  diagnoseTelemetryClaims — hook fired names an untrusted Codex hook, not never having fired, when the trust state says so
  diagnoseTelemetryClaims — hook fired names an untrusted hook for this session too, when an older session left a run file but this one did not
  diagnoseTelemetryClaims — hook fired names the hook never having fired when no run file appears
  diagnoseTelemetryClaims — hook fired names the recorder as what is missing when it is declared nowhere and no run file has appeared
  diagnoseTelemetryClaims — hook fired names this session as having left no run file when an older one exists but not its own
  diagnoseTelemetryClaims — hook fired reads ok once the current session's own run file is found among them
  diagnoseTelemetryClaims — hook fired reports nothing to evaluate, never a failure, when the recorder is declared but no run file has appeared
  diagnoseTelemetryClaims — hook fired says it could not tell, never a failure, when the declaration itself could not be read
  diagnoseTelemetryClaims — hook fired says nothing about trust for a tool with no trust gate
  diagnoseTelemetryClaims — hook fired says the trust state could not itself be read, rather than guessing
  diagnoseTelemetryClaims — hook fired still names the generic never-fired fault once the hook is actually trusted
  diagnoseTelemetryClaims — records join has nothing to join when neither a step interval nor a tool-stated step exists
  diagnoseTelemetryClaims — records join has nothing to join when no record was read
  diagnoseTelemetryClaims — records join names every record unattributed, not a missing record
  diagnoseTelemetryClaims — records join reads ok once a record joined a step
  diagnoseTelemetryClaims — session journalled has nothing to read when no run file exists
  diagnoseTelemetryClaims — session journalled names a run file that carries only session_start
  diagnoseTelemetryClaims — session journalled reads ok when a run file closed its turn
  diagnoseTelemetryClaims — the whole set always returns exactly four claims, in the fixed order, none of them ever unjudged
  diagnoseTelemetryClaims — the whole set no claim mentions exporting, a destination, or an identity attribute
  diagnoseTelemetryClaims — the whole set no claim recommends a command the system no longer offers
  diagnoseTelemetryClaims — tool files readable carries the count read against the count attempted, not just the tool that worked
  diagnoseTelemetryClaims — tool files readable has no session to look for when the journal names none
  diagnoseTelemetryClaims — tool files readable names a reader that threw as failing to read, not as a plain miss
  diagnoseTelemetryClaims — tool files readable names no session found for any tool, while the journal names one
  diagnoseTelemetryClaims — tool files readable reads ok once one covered tool found the session
  the diagnostic skill states the claims the command prints, in the number it prints them agrees with the actual number of claims diagnoseTelemetryClaims prints, everywhere it is stated
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons anchorless-run-file is never paired with the wrong verdict token in step 6
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons anchorless-run-file is what step 6 of the skill teaches, in the same sentence as its own verdict token
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons anchorless-run-file is what the live code actually produces
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declaration-unreadable is never paired with the wrong verdict token in step 6
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declaration-unreadable is what step 6 of the skill teaches, in the same sentence as its own verdict token
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declaration-unreadable is what the live code actually produces
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-not-yet-fired is never paired with the wrong verdict token in step 6
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-not-yet-fired is what step 6 of the skill teaches, in the same sentence as its own verdict token
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-not-yet-fired is what the live code actually produces
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-nowhere is never paired with the wrong verdict token in step 6
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-nowhere is what step 6 of the skill teaches, in the same sentence as its own verdict token
  the diagnostic skill's account of every no-run-file reason matches the command's own reasons recorder-declared-nowhere is what the live code actually produces
# tests/domain/models/telemetry-export-leftover.unit.test.ts
  findLeftoverExportKeys finds nothing in a file with no env block
  findLeftoverExportKeys finds nothing in an env block that carries none of the known keys
  findLeftoverExportKeys names every known export key present in the file's env block
  findLeftoverExportKeys reads a file that does not exist (null) as nothing found
  findLeftoverExportKeys reads an env block that is not an object as nothing found
  findLeftoverExportKeys reads unparseable content as nothing found, rather than throwing
# tests/domain/models/telemetry-host-registration.unit.test.ts
  what a host's own registry says about a plugin AIDD installed gives every plugin its own entry, across tools
  what a host's own registry says about a plugin AIDD installed is not registered when the registry was read and lacks the ref
  what a host's own registry says about a plugin AIDD installed is registered when the registry carries its ref
  what a host's own registry says about a plugin AIDD installed is unanswerable for a host nothing here knows how to ask
  what a host's own registry says about a plugin AIDD installed is unanswerable when no ref can be built at all, and names no ref
  what a host's own registry says about a plugin AIDD installed is unanswerable when the registry could not be read, never `not-registered`
  what a host's own registry says about a plugin AIDD installed reports no entry for a project with nothing installed
  what a host's own registry says about a plugin AIDD installed says a declared registry is unmeasured, not that none exists
  what a host's own registry says about a plugin AIDD installed says a host declaring no registry has none to read
  what a host's own registry says about a plugin AIDD installed tells a disabled registration from an absent one
# tests/domain/models/telemetry-removal.unit.test.ts
  TelemetryRemovalPreview — a project's journal and a machine's records are never the same kind of thing carries what cannot be reached beside what can, on the same value
  TelemetryRemovalPreview — a project's journal and a machine's records are never the same kind of thing names the journal as this project's own
  TelemetryRemovalPreview — a project's journal and a machine's records are never the same kind of thing names the sink and the identity file as this machine's own
  telemetryRemovalIsEmpty() is empty when every location has nothing
  telemetryRemovalIsEmpty() is not empty when an identity is present, even if damaged
  telemetryRemovalIsEmpty() is not empty when the journal holds a run file
  telemetryRemovalIsEmpty() is not empty when the sink holds a day file
# tests/domain/models/telemetry-setup.unit.test.ts
  buildTelemetryAllowedSetup — whose choice this was never lets a damaged switch file masquerade as a refusal
  buildTelemetryAllowedSetup — whose choice this was never treats an unset AIDD_TELEMETRY as a refusal
  buildTelemetryAllowedSetup — whose choice this was reads AIDD_TELEMETRY=0 as this person's own refusal, whatever the project file says
  buildTelemetryAllowedSetup — whose choice this was reads a person's refusal as always readable — an env var never fails to read
  buildTelemetryAllowedSetup — whose choice this was reads a project never switched on as the project's own decision, not a refusal
  buildTelemetryAllowedSetup — whose choice this was reads a project's own switch, turned on, as the project's decision
# tests/domain/models/telemetry-sink-record.unit.test.ts
  parseTelemetrySinkLine() carries provenance for both routes, on the same fixture
  parseTelemetrySinkLine() parses a hand-written fixture the mapper never produced
  parseTelemetrySinkLine() parses a line written before cli_version existed, losing no figure to the gap
  parseTelemetrySinkLine() parses a stored line that still carries the now-removed user_id, inertly
  parseTelemetrySinkLine() rejects an unknown sink_schema_version rather than guessing its shape
  parseTelemetrySinkLine() rejects the v1 shape specifically, not just an unrecognised number
  telemetrySinkRecordDayKey() answers the UTC day for a real moment, the fast path and the parsed one alike
  telemetrySinkRecordDayKey() answers undefined for a string merely shaped like a moment, never a sliced fragment
  telemetrySinkRecordDayKey() answers undefined for no moment at all
  telemetrySinkRecordDayKey() — a line holds whatever it holds answers nothing for a moment stored as a number, never 1970
  telemetrySinkRecordDayKey() — a line holds whatever it holds answers nothing for a moment stored as null
# tests/domain/models/telemetry-sink-retention.unit.test.ts
  decideTelemetrySinkRetention() accepts files out of order and still sorts chronologically
  decideTelemetrySinkRetention() defaults to a ninety-day window
  decideTelemetrySinkRetention() keeps the window's files and prunes the oldest, on real file names
  decideTelemetrySinkRetention() never prunes the newest file, even at a window of 0
  decideTelemetrySinkRetention() touches nothing when the sink is younger than the window
# tests/domain/models/telemetry-switch.unit.test.ts
  buildTelemetrySwitchFile falls back to an empty root when the existing content is unparseable
  buildTelemetrySwitchFile omits the endpoint key when none is given
  buildTelemetrySwitchFile preserves unrelated top-level keys already in the file
  buildTelemetrySwitchFile writes enabled and endpoint from nothing
  parseTelemetrySwitchFile reads enabled and endpoint from a well-formed switch
  parseTelemetrySwitchFile reads enabled: false without an endpoint
  parseTelemetrySwitchFile returns null for unparseable JSON — the same failure direction as the hook
  parseTelemetrySwitchFile returns null when the telemetry key has the wrong shape
  parseTelemetrySwitchFile returns null when the telemetry key is absent
  parseTelemetrySwitchFile treats a non-boolean-true enabled value as off, not a throw
  personRefusesTelemetry only the literal string '0' is a refusal
  personRefusesTelemetry unset, empty, or any other value is not a choice — never a refusal
  resolveTelemetryEnabled an unset refusal never turns measurement on by itself
  resolveTelemetryEnabled no refusal, project off or absent — not enabled
  resolveTelemetryEnabled no refusal, project on — enabled
  resolveTelemetryEnabled the refusal wins over a project that turned measurement on
  telemetryConfigPath resolves .aidd/config.json under the project root
  the hook (repo.cjs) and the CLI agree, for every combination file off, no refusal => false
  the hook (repo.cjs) and the CLI agree, for every combination file off, refused => false
  the hook (repo.cjs) and the CLI agree, for every combination file on, any other value is not a choice => true
  the hook (repo.cjs) and the CLI agree, for every combination file on, empty refusal is not a choice => true
  the hook (repo.cjs) and the CLI agree, for every combination file on, no refusal => true
  the hook (repo.cjs) and the CLI agree, for every combination file on, refused => false
  the hook (repo.cjs) and the CLI agree, for every combination no file, no refusal => false
  the hook (repo.cjs) and the CLI agree, for every combination no file, refused => false
# tests/domain/tools/telemetry-route-supply.unit.test.ts
  what a route declares it supplies, against what its reader actually produces claude's local route supplies exactly what it declares
  what a route declares it supplies, against what its reader actually produces codex's local route supplies exactly what it declares
  what a route declares it supplies, against what its reader actually produces copilot's local route supplies exactly what it declares
  what a route declares it supplies, against what its reader actually produces has a capture for every route that claims to supply anything
  what a route declares it supplies, against what its reader actually produces opencode's local route supplies exactly what it declares
# tests/e2e/telemetry-backlog-axis.e2e.test.ts
  aidd telemetry report — by_backlog through the real adapter, on real disk leaves every task folder byte-identical after the report runs
  aidd telemetry report — by_backlog through the real adapter, on real disk merges two tasks declaring the same backlog item into one row, and gives the third its own
  aidd telemetry report — by_backlog through the real adapter, on real disk prints the backlog axis through --axis, naming the item and the none row
  aidd telemetry report — by_backlog through the real adapter, on real disk reconciles by_backlog to the same total as the period and as by_task
# tests/e2e/telemetry-check-skill-commands.e2e.test.ts
  E2E: 02-check answers through the CLI every command the skill names is one the CLI accepts
  E2E: 02-check answers through the CLI names no script beside itself any more
# tests/e2e/telemetry-check.e2e.test.ts
  aidd telemetry check — not yet stops being a failure keeps the verdict a run file already earned, whatever the recorder's own declaration says
  aidd telemetry check — not yet stops being a failure keeps the verdict an anchorless run file already earned once the recorder is declared, never nothing to evaluate
  aidd telemetry check — not yet stops being a failure reports nothing to evaluate, never a failure, once the recorder is declared — and a failure naming it before that
  aidd telemetry check — the journey and its edge cases falls back to never-fired, never a guess at trust, when Codex's config.toml is absent entirely
  aidd telemetry check — the journey and its edge cases names a non-repository, and never blames the hook
  aidd telemetry check — the journey and its edge cases names an anchorless run file as its own failure, not an unrecognised payload, for a run file torn before session_start ever parsed
  aidd telemetry check — the journey and its edge cases names an unrecognised payload the real hook wrote, not one this test typed
  aidd telemetry check — the journey and its edge cases names an unrecognised payload, not a hook that never ran
  aidd telemetry check — the journey and its edge cases names an untrusted Codex hook, not a hook that never fired
  aidd telemetry check — the journey and its edge cases names the hook never firing when measurement is on and no run file appears
  aidd telemetry check — the journey and its edge cases reports a hook approved under an old event name as untrusted — approval is per entry
  aidd telemetry check — the journey and its edge cases settles every claim — none is ever printed as not yet judged
  aidd telemetry check — the journey and its edge cases stops at the switch before judging anything else
  aidd telemetry check — what is in place, before any verdict distinguishes this person's own refusal from a project nobody switched on
  aidd telemetry check — what is in place, before any verdict keeps every other stated fact when the identity file cannot be read
  aidd telemetry check — what is in place, before any verdict names Copilot's own settings file as a declaration route, not one this build never reads
  aidd telemetry check — what is in place, before any verdict names Cursor's project-scope hooks file as a declaration — the only route a Cursor install's hook ever fires from
  aidd telemetry check — what is in place, before any verdict names where the recorder is declared, when a hooks block invokes it directly rather than through enabledPlugins
  aidd telemetry check — what is in place, before any verdict names where the recorder is declared, when a tool's own settings say so
  aidd telemetry check — what is in place, before any verdict never reads another plugin's own journal.cjs as this recorder being declared
  aidd telemetry check — what is in place, before any verdict says the declaration could not be read, never that the recorder is missing, for a damaged declaring file
  aidd telemetry check — what is in place, before any verdict states what is in place on a machine that has never measured anything, naming the file behind each fact
  aidd telemetry check — what is in place, before any verdict still recognises the recorder's own hooks-block entry point when the command is quoted
  aidd telemetry check — what is in place, before any verdict stops recognising a hooks block once it stops naming the recorder's own script, proving the match is not a loose substring
# tests/e2e/telemetry-commit-trailer.e2e.test.ts
  a commit names the session that made it carries nothing at all until measurement is turned on
  a commit names the session that made it carries nothing when no session made the commit
  a commit names the session that made it carries the session's own identifier once measurement is on
  a commit names the session that made it keeps a hook the repository already ran, and commits still succeed
  a commit names the session that made it names the session actually running, not the one whose variable it inherited
  a commit names the session that made it says what it did, so nobody finds a trailer in their history unannounced
  a commit names the session that made it stops trailering after off, and leaves the commits already made alone
  a commit names the session that made it writes it once, not twice, when the commit is amended
# tests/e2e/telemetry-cost-skill-commands.e2e.test.ts
  E2E: 01-cost answers through the CLI every command the skill names is one the CLI accepts
  E2E: 01-cost answers through the CLI names no script beside itself any more
  E2E: 01-cost answers through the CLI the envelope is what the deleted script produced, field for field
  E2E: 01-cost answers through the CLI the fixture is not vacuous, so this pin cannot pass on emptiness
# tests/e2e/telemetry-flow-axis.e2e.test.ts
  aidd telemetry report — by_flow through the real adapter, on real disk gives the same orchestrating skill run twice in one session two rows, never merged into one
  aidd telemetry report — by_flow through the real adapter, on real disk gives work before the first orchestrating step its own row, outside any flow
  aidd telemetry report — by_flow through the real adapter, on real disk prints the flow axis through --axis, naming both runs and the outside-flow row
  aidd telemetry report — by_flow through the real adapter, on real disk reconciles by_flow to the same total as the period
# tests/e2e/telemetry-forget.e2e.test.ts
  aidd telemetry forget — shows, confirms, removes, and names what history keeps a damaged record file is removed and reported as removed, exactly like any other
  aidd telemetry forget — shows, confirms, removes, and names what history keeps a machine where nothing was ever measured has nothing to remove, and offers nothing
  aidd telemetry forget — shows, confirms, removes, and names what history keeps a relocated AIDD_RUNS_DIR touches only the relocated location, never the project's own runs dir
  aidd telemetry forget — shows, confirms, removes, and names what history keeps a relocated AIDD_USER_CONFIG_DIR touches only the relocated location, never the real profile
  aidd telemetry forget — shows, confirms, removes, and names what history keeps a run file that refuses removal (a directory named *.jsonl) is reported, and the rest is still removed
  aidd telemetry forget — shows, confirms, removes, and names what history keeps history is repeated after removing, not only before
  aidd telemetry forget — shows, confirms, removes, and names what history keeps previews a staged-but-never-committed journal honestly, never as certainly held
  aidd telemetry forget — shows, confirms, removes, and names what history keeps previews a tracked journal as history certainly holding it, naming the file
  aidd telemetry forget — shows, confirms, removes, and names what history keeps previews an untracked journal as history possibly holding it, never as an all-clear
  aidd telemetry forget — shows, confirms, removes, and names what history keeps with --yes, removes exactly what was shown, in counts that match, and leaves the switch alone
  aidd telemetry forget — shows, confirms, removes, and names what history keeps without --yes, refuses: nothing removed, and it says so plainly, exiting successfully
# tests/e2e/telemetry-hook-install.e2e.test.ts
  E2E: the journal hook runs from where installation puts it records a session through the installed plugin, not the source tree
# tests/e2e/telemetry-host-registration.e2e.test.ts
  check says whether the host will load what aidd installed does not count a registration made for a different project
  check says whether the host will load what aidd installed names each plugin's answer, with no AI tool on PATH and nothing to spend
# tests/e2e/telemetry-identity-resolution.e2e.test.ts
  aidd telemetry report --axis person, and the identity commands that feed it a second machine's identifier prints unresolved before linking, and merges after
  aidd telemetry report --axis person, and the identity commands that feed it an identity placed under a project-scoped config directory has no effect
  aidd telemetry report --axis person, and the identity commands that feed it an identity that does not parse costs the resolution, never one figure
  aidd telemetry report --axis person, and the identity commands that feed it identity lists every added identifier with no report ever run
  aidd telemetry report --axis person, and the identity commands that feed it no identity declared at all still reports every figure, naming that cause
  aidd telemetry report --axis person, and the identity commands that feed it sums every person row to the period total, and never merges two unmapped identifiers
  aidd telemetry report --axis person, and the identity commands that feed it the two causes read as two different caveats end to end
  aidd telemetry report --axis person, and the identity commands that feed it two tools under one identifier print one person row
# tests/e2e/telemetry-identity.e2e.test.ts
  a choice made today does not reach backwards records stored before opting in stay unnamed; only later records carry it
  aidd telemetry identity — the journey and its edge cases a minted identity discloses what it attaches to, and what it never attaches to
  aidd telemetry identity — the journey and its edge cases a repository pointing AIDD_USER_CONFIG_DIR elsewhere never moves an existing identity
  aidd telemetry identity — the journey and its edge cases a second use reports the same identifier, never a new one
  aidd telemetry identity — the journey and its edge cases an empty OS profile beside a populated AIDD_USER_CONFIG_DIR still reads off
  aidd telemetry identity — the journey and its edge cases an unreadable identity file surfaces as an error, never as 'no identity is set'
  aidd telemetry identity — the journey and its edge cases mints for a name given before anything stands, rather than refusing
  aidd telemetry identity — the journey and its edge cases off on a profile that never had an identity says there was nothing to withdraw
  aidd telemetry identity — the journey and its edge cases off removes an identity file that exists but names nobody
  aidd telemetry identity — the journey and its edge cases off removes the whole declaration, stating how many added identifiers went with it
  aidd telemetry identity — the journey and its edge cases off says past records keep the identifier they were written with
  aidd telemetry identity — the journey and its edge cases off still withdraws a damaged identity file, and says it was discarded
  aidd telemetry identity — the journey and its edge cases walks identity -> use -> use --name -> identity -> off, each state legible from stdout
  the on-disk format the deleted script produced name: matches the exact bytes the script wrote from the same starting identity
  the on-disk format the deleted script produced use with no identifier: from empty, mints a v4 identifier recording how it was obtained
  what a default install actually stores: reading every line it wrote carries no person field anywhere, proven from the stored bytes
# tests/e2e/telemetry-init-skill-commands.e2e.test.ts
  E2E: 00-init calls the CLI 01-check's absent-CLI wording has not drifted from 01-cost's own copy
  E2E: 00-init calls the CLI every command the skill names is one the CLI accepts, run in a safe order
  E2E: 00-init calls the CLI names no script beside itself any more
  E2E: 00-init calls the CLI the skill's account names both the preview and the confirmed removal
  E2E: 00-init calls the CLI the sweep itself would fail if the skill's account named a command the CLI refuses
# tests/e2e/telemetry-journal-gitignore.e2e.test.ts
  aidd setup never offers the run journal to a commit adds the run journal to .gitignore, and covers nothing wider
  aidd setup never offers the run journal to a commit stops offering a journalled session to git status once measurement is on
# tests/e2e/telemetry-lifecycle.e2e.test.ts
  measurement, from nothing to off and back answers a program the same way through the same cycle
  measurement, from nothing to off and back leaves the project's own config alone through the whole cycle
  measurement, from nothing to off and back lives the whole sequence, each step meaning what the one before it set up
# tests/e2e/telemetry-multi-tool.e2e.test.ts
  aidd telemetry, across every tool that can be read attributes a task from what the journal hook itself recorded
  aidd telemetry, across every tool that can be read breaks a real session down by model and lists only models
  aidd telemetry, across every tool that can be read names the one tool nothing here can read, with its measured reason
  aidd telemetry, across every tool that can be read reads three tools' own files and reports all three in one period
  aidd telemetry, across every tool that can be read shows all three attribution strengths at once, each from its own source
  aidd telemetry, across every tool that can be read stamps every stored record with this CLI's own version, read through the real binary - never the framework's
  aidd telemetry, across every tool that can be read stores nothing twice when the same sessions are read again
  the flow a person can actually follow answers a program with the same object twice, for the same absolute period
  the flow a person can actually follow reads every journalled session without anyone naming one
  the flow a person can actually follow refuses a period that is not one, naming the flag
  the flow a person can actually follow says so, and exits 0, when nothing has been journalled yet
  the flow a person can actually follow tells a program what each tool can supply, so it never infers it from a missing number
# tests/e2e/telemetry-on-runs-privacy.e2e.test.ts
  aidd telemetry on carries over what the switch script did beyond flipping a flag a journal already tracked by git is named once, and nothing is removed or rewritten
  aidd telemetry on carries over what the switch script did beyond flipping a flag a project outside any git repository still turns on, quietly
  aidd telemetry on carries over what the switch script did beyond flipping a flag adds the run journal to .gitignore, and nothing wider
  aidd telemetry on carries over what the switch script did beyond flipping a flag an existing entry is left as it is, never duplicated
  aidd telemetry on carries over what the switch script did beyond flipping a flag git add -A stages the .gitignore change and leaves the journal out of the index
  aidd telemetry on carries over what the switch script did beyond flipping a flag nothing extra is said when no journal file is tracked
  aidd telemetry on carries over what the switch script did beyond flipping a flag turning measurement off touches neither .gitignore nor the tracked-file notice
# tests/e2e/telemetry-plugin-standalone.e2e.test.ts
  the plugin measures on its own journals a whole Claude Code session with no aidd on the path
  the plugin measures on its own reads a session's figures complete, though the CLI did not exist when it ran
# tests/e2e/telemetry-reference-week.e2e.test.ts
  a report that needs no read first answers with figures on a sink nobody has filled
  the reference week breaks the week down by task, and by the backlog item a task declared
  the reference week breaks the week down by the flow that ran, keeping what ran outside one apart
  the reference week counts what the week actually produced
  the reference week gives every day of the period a row, and only the worked days a figure
  the reference week keeps a session-total tool out of the request totals and still shows its figure
  the reference week leads with the run it can name, though more of the week fell outside every flow
  the reference week names a teammate's records as an identity it cannot resolve, never as nobody
  the reference week names each step's attribution, all three strengths in one week
  the reference week names every tool it cannot read, with the reason, rather than omitting it
  the reference week prints, beside those figures, the two things this axis cannot tell apart
  the reference week reconciles every breakdown to that same total
  the reference week splits the week by person and by project, without either standing in for the other
  the reference week states no amount anywhere, because no tool supplies one
  the week builds inside a git hook's own environment ignores a leaked GIT_DIR rather than resolving the real repository
# tests/e2e/telemetry-refusal.e2e.test.ts
  a person's own refusal, without touching a tracked file an unset refusal turns nothing on by itself, and a project with measurement on still records
  a person's own refusal, without touching a tracked file refusing in this person's own environment records nothing, in a project whose tracked configuration allows it
  a person's own refusal, without touching a tracked file removing the refusal records again, in the same project whose switch never changed
  a person's own refusal, without touching a tracked file the refusal wins over a project that turns measurement on, never the file
  turning measurement on for everyone who clones is confirmed confirmed with --yes, writes the switch and says what was done
  turning measurement on for everyone who clones is confirmed turning it off needs no confirmation
  turning measurement on for everyone who clones is confirmed without --yes, refuses and writes nothing, naming the consequence
# tests/e2e/telemetry-report.e2e.test.ts
  aidd telemetry report keeps only the project asked for, saying so in the object it answers with
  aidd telemetry report leaves work outside the period out of it, however recently it was stored
  aidd telemetry report names a project nobody ever worked in, apart from a total of zero
  aidd telemetry report names every tool that cannot be read, with its own reason
  aidd telemetry report narrows two filters to their intersection, project as filter and step as axis
  aidd telemetry report prints nothing measured and exits 0 for a period holding nothing
  aidd telemetry report prints the composed selection in the header a person reads
  aidd telemetry report refuses a period that is not a whole number of days, naming the flag
  aidd telemetry report reports what a real session consumed
  aidd telemetry report tells a known value idle in this period apart from one never seen at all
# tests/e2e/telemetry-six-questions.e2e.test.ts
  aidd telemetry report — the six questions, over one period answers total, by model, by task, by step, by person and by project, all reconciling
  aidd telemetry report — the six questions, over one period names the no-task row for what is known, never for what is guessed
  aidd telemetry report — the six questions, over one period prints every axis through --axis, each stating the same total it belongs to
# tests/e2e/telemetry-stored-export-record.e2e.test.ts
  a record the removed export route already wrote stays readable counts once, not twice, when the same billed call also has a local-read sibling
  a record the removed export route already wrote stays readable is counted by `aidd telemetry report`, with its own figures
# tests/e2e/telemetry-task-midsession.e2e.test.ts
  aidd telemetry report — a task declared while the work is still going attributes what follows a declaration while the session is still running, and the same closing the turn afterwards does not change
  aidd telemetry report — a task declared while the work is still going names each of the three unattributed reasons distinctly, never collapsing two into one
  aidd telemetry report — a task declared while the work is still going prints each reason in the text rendering too, never one label for all three
# tests/e2e/telemetry.e2e.test.ts
  E2E: aidd telemetry on/off — the switch alone off on a project never turned on leaves the switch absent and every tool untouched
  E2E: aidd telemetry on/off — the switch alone on succeeds with no endpoint anywhere, and writes no tool's settings file
  E2E: the deleted export route's commands are gone, not disabled `telemetry endpoint` is refused as unknown, the way any unknown command is
  E2E: the deleted export route's commands are gone, not disabled `telemetry receive` is refused as unknown, the way any unknown command is
# tests/infrastructure/adapters/copilot-cost-reader-adapter.integration.test.ts
  CopilotCostReaderAdapter answers with nothing, not an error, when the declared home does not exist
  CopilotCostReaderAdapter finds the session and reports it empty, not missing, when shutdown carried no tokenDetails
  CopilotCostReaderAdapter reads one session record from its own events.jsonl, stamped with the id it was asked for
  CopilotCostReaderAdapter says it found no session, not that the session cost nothing, when no directory names it
# tests/infrastructure/adapters/git-adapter-telemetry-project-id.integration.test.ts
  neither side follows a leaked GIT_DIR reads the remote of the repository at cwd, not the one GIT_DIR names
# tests/infrastructure/adapters/opencode-cost-reader-adapter.integration.test.ts
  OpencodeCostReaderAdapter reads a well-behaved export into one record per billed message
  OpencodeCostReaderAdapter returns nothing when the opencode binary is not on PATH
  OpencodeCostReaderAdapter says it found no session, not an error, for an unknown session
  OpencodeCostReaderAdapter throws OpencodeExportError when the command answers with something that is not JSON
  OpencodeCostReaderAdapter throws OpencodeExportError, and stores nothing, on a non-zero exit unrelated to an unknown session
  OpencodeCostReaderAdapter throws OpencodeExportError, and stores nothing, when the command exceeds its timeout
# tests/infrastructure/adapters/person-identity-adapter.integration.test.ts
  PersonIdentityAdapter — what it writes, and what it reads back adds and withdraws an added identifier, leaving the person's own untouched
  PersonIdentityAdapter — what it writes, and what it reads back keeps a display name across a later write
  PersonIdentityAdapter — what it writes, and what it reads back mints an identifier that survives a read back through the file
  PersonIdentityAdapter — what it writes, and what it reads back reads a damaged file as nothing, and refuses it strictly
  PersonIdentityAdapter — what it writes, and what it reads back reads back nothing at all before anyone has chosen
  PersonIdentityAdapter — what it writes, and what it reads back records an adopted identifier as adopted, not as minted
  PersonIdentityAdapter — what it writes, and what it reads back refuses to add an identifier when nobody has chosen one to add it onto
  PersonIdentityAdapter — what it writes, and what it reads back refuses to list the person's own identifier among the ones added onto them
  PersonIdentityAdapter — what it writes, and what it reads back writes a file a person can open and correct by hand
  PersonIdentityAdapter.forget — resolved once, acts on the path it is handed acts on the path it is handed, immune to HOME being relocated afterwards
  PersonIdentityAdapter.forget — resolved once, acts on the path it is handed is a no-op, not a failure, when the path is already gone
  PersonIdentityAdapter.forget — resolved once, acts on the path it is handed removes the identity file it was constructed against
# tests/infrastructure/adapters/person-identity-location.unit.test.ts
  where the identity file lands AIDD_USER_CONFIG_DIR never moves it, on either platform
  where the identity file lands Windows without APPDATA falls back rather than inventing a path
  where the identity file lands a POSIX machine keeps it under the OS user's own .config
  where the identity file lands a Windows machine keeps it under %APPDATA%, never under .config
# tests/infrastructure/adapters/run-journal-file-written.integration.test.ts
  file_written, from the hook that writes it to the reader that reads it appends a repository-relative path the reader surfaces as written
  file_written, from the hook that writes it to the reader that reads it covers Claude Code alone, which a report has to print as a limit rather than assume away
  file_written, from the hook that writes it to the reader that reads it records nothing for a write outside any task folder
  file_written, from the hook that writes it to the reader that reads it uses the session id it is handed, not the payload's own spelling
# tests/infrastructure/adapters/run-journal-reader-adapter.integration.test.ts
  RunJournalReaderAdapter answers null for a session no run file names, rather than the wrong file
  RunJournalReaderAdapter answers null, not an error, when aidd_docs/runs does not exist at all
  RunJournalReaderAdapter honors AIDD_RUNS_DIR over <projectRoot>/aidd_docs/runs, matching the writing hook
  RunJournalReaderAdapter reads a session's step_start and turn_end lines, in file order, skipping every other type
  RunJournalReaderAdapter skips a truncated final line rather than failing the whole read
  RunJournalReaderAdapter, beyond the boundaries honours AIDD_RUNS_DIR when listing, exactly as when reading one session
  RunJournalReaderAdapter, beyond the boundaries keeps a session's boundaries when its header line is torn
  RunJournalReaderAdapter, beyond the boundaries lists every session it holds, for a caller with no identifier to ask about
  RunJournalReaderAdapter, beyond the boundaries lists nothing, rather than throwing, when no runs directory exists
  RunJournalReaderAdapter, beyond the boundaries reads no plugin_version at all for a line written before this field existed - unknown, never a guessed default
  RunJournalReaderAdapter, beyond the boundaries reads plugin_version off the header when the hook stamped one
  RunJournalReaderAdapter, beyond the boundaries reads the header line, so a report knows which tool and project a session was
  RunJournalReaderAdapter, beyond the boundaries reads the written paths as paths, deriving no task from them
  RunJournalReaderAdapter, beyond the boundaries refuses a header missing a field a join needs, rather than surfacing half of one
  RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed acts on the dir it is handed, immune to AIDD_RUNS_DIR being relocated afterwards
  RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed is a no-op, not a failure, when the name is already gone
  RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed refuses a bare '..' or '.' rather than acting on the directory itself
  RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed refuses a relative walk out of the directory it is handed, rather than deleting outside it
  RunJournalReaderAdapter.deleteRunFile — confined to the directory it is handed removes a run file by name, from the directory it is handed
  sanitizePathSegment — agrees with the journal hook's own function matches for 
  sanitizePathSegment — agrees with the journal hook's own function matches for .
  sanitizePathSegment — agrees with the journal hook's own function matches for ..
  sanitizePathSegment — agrees with the journal hook's own function matches for 22222222-2222-4222-8222-222222222222
  sanitizePathSegment — agrees with the journal hook's own function matches for already__contains-a-double-underscore
  sanitizePathSegment — agrees with the journal hook's own function matches for has spaces
  sanitizePathSegment — agrees with the journal hook's own function matches for weird/../chars?
# tests/infrastructure/adapters/run-journal-task-declared.integration.test.ts
  task_declared, from the hook that writes it to the reader that reads it appends a repository-relative path the reader surfaces as declared
  task_declared, from the hook that writes it to the reader that reads it declares nothing for a call that names no task path at all
  task_declared, from the hook that writes it to the reader that reads it derives a bounded interval a report can attribute a record against
  task_declared, from the hook that writes it to the reader that reads it uses the session id it is handed, not the payload's own spelling
# tests/infrastructure/adapters/telemetry-evidence-adapter.integration.test.ts
  a payload that matched no known host answers nothing for a line that is not one of these records
  a payload that matched no known host answers nothing when the file is absent
  a payload that matched no known host reads the moment one arrived
  an export a deleted command left behind in a tool's own settings finds none in a project whose settings carry no export at all
  an export a deleted command left behind in a tool's own settings names the file and the keys still in it
  what the switch setup reports, beside the answer itself names the file it read, and reads a damaged one as unreadable rather than off
  what the switch setup reports, beside the answer itself reads an absent file as readable and undecided
  whether anything is declared to do the recording finds it in a Claude hooks block that names the entry point by its plugin token
  whether anything is declared to do the recording finds it in enabledPlugins whatever marketplace the key names
  whether anything is declared to do the recording finds the recorder in the manifest a plugin install writes
  whether anything is declared to do the recording names a damaged location as unreadable rather than counting it as undeclared
  whether anything is declared to do the recording refuses a hooks block naming a bare journal.cjs belonging to some other plugin
  whether anything is declared to do the recording reports nothing declared, and still names every location it looked in
  whether measurement is allowed here lets a person refuse in their own environment, over a project that turned it on
  whether measurement is allowed here reads a project that never decided as off, without a file to read
  whether measurement is allowed here reads a project that turned it on
  whether measurement is allowed here treats a switch file that is not JSON as off, never as on
# tests/infrastructure/adapters/telemetry-sink-adapter.integration.test.ts
  TelemetrySinkAdapter appends real lines and reports whether the day file was just created
  TelemetrySinkAdapter fails ensureWritable at startup with a message naming the path, when the directory cannot be written
  TelemetrySinkAdapter finds a vendor's records across every day file, ignoring other vendors
  TelemetrySinkAdapter never rewrites the file it appends to — appendRecord is the only write primitive
  TelemetrySinkAdapter prunes real day files beyond the window, keeping the newest, on real disk state
  TelemetrySinkAdapter skips a torn final line rather than failing the whole scan
  TelemetrySinkAdapter writes under <userConfigDir>/telemetry, honoring the constructor override
  TelemetrySinkAdapter.readRecordsInPeriod answers an empty period with no records and nothing skipped, never an error
  TelemetrySinkAdapter.readRecordsInPeriod hands back a record with no moment rather than placing it in a period
  TelemetrySinkAdapter.readRecordsInPeriod keeps a moment-less record out of every period, however wide
  TelemetrySinkAdapter.readRecordsInPeriod places a moment written with a non-UTC offset on the day it actually happened
  TelemetrySinkAdapter.readRecordsInPeriod reads across sessions, unlike the per-vendor read it sits beside
  TelemetrySinkAdapter.readRecordsInPeriod reads the same period whichever way round the two days are given
  TelemetrySinkAdapter.readRecordsInPeriod returns every record inside the range and none outside it
  TelemetrySinkAdapter.readRecordsInPeriod selects on when the work ran, not on the day file the line landed in
  TelemetrySinkAdapter.readRecordsInPeriod skips a line whose schema version this build does not know, and says how many
  TelemetrySinkAdapter.readRecordsInPeriod skips a torn final line, keeps the file's other lines, and counts what it skipped
  the real sink and its in-memory double place a record on the same day agrees on which records fall in a period and which carry no moment at all
  the real sink and its in-memory double place a record on the same day refuses a relative walk out of the directory it is handed, rather than deleting outside it
# tests/infrastructure/adapters/telemetry-sink-location.unit.test.ts
  a sandboxed run's sink, agreed between the helper and the adapter agrees on linux, whichever platform this suite runs on
  a sandboxed run's sink, agreed between the helper and the adapter agrees on win32, whichever platform this suite runs on
  where the figures land by default Windows without APPDATA falls back rather than inventing a path
  where the figures land by default a POSIX machine keeps them under the OS user's own .config
  where the figures land by default a fresh Windows machine keeps them under %APPDATA%, never under .config
  where the figures land by default the plugin README states the exact default the code writes
  where the figures land, and what does not follow them there leaves the token where it was when the figures are shared
  where the figures land, and what does not follow them there prefers the name given to the figures when both are set
  where the figures land, and what does not follow them there puts the figures exactly where AIDD_TELEMETRY_DIR names, not in a subdirectory of it
  where the figures land, and what does not follow them there still honours the older variable, so a setup that predates the split keeps working
  who may list the days a person worked leaves a location a person named themselves exactly as they made it
  who may list the days a person worked tightens a default location to this person alone
# tests/infrastructure/adapters/transcript-cost-reader-adapter.integration.test.ts
  TranscriptCostReaderAdapter — Claude Code answers with nothing, not an error, when the declared root does not exist
  TranscriptCostReaderAdapter — Claude Code reads both the main transcript and a subagent's own file for one session
  TranscriptCostReaderAdapter — Claude Code says it found no session, not that the session cost nothing, when no file names it
  TranscriptCostReaderAdapter — Codex finds the resumed session, so a report never reads 38% of Codex sessions as absent
  TranscriptCostReaderAdapter — Codex resolves a resumed session by its own id, never its parent's, even with both on disk
  TranscriptCostReaderAdapter — Codex resolves the parent's own session independently, not the resumed session's records
  TranscriptCostReaderAdapter — Codex says it found no session for an id no rollout file names
# tests/integration/telemetry-trailer-line-agrees.integration.test.ts
  the hook and the CLI spell the call site identically agrees on a POSIX path
  the hook and the CLI spell the call site identically agrees on a Windows path, where the separator is the whole difficulty
  the hook and the CLI spell the call site identically agrees on a path with spaces
  the hook and the CLI spell the call site identically agrees on the delegate's filename, which decides where each side looks
  the hook and the CLI spell the call site identically agrees on the header a hook written from scratch starts with
  the hook and the CLI spell the call site identically agrees on the hook's own filename
  what the repair reports about a directory it will not write to declines a hooks directory outside the git directory, delegate and all
  what the repair reports about a directory it will not write to has nothing to do without a hooks directory at all
  what the repair reports about a directory it will not write to repairs one inside it
```
