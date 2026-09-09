# One route, and every sentence about it true

## Target

Measurement has exactly one way of producing a record — reading the files a tool already wrote — so that what the system does, what it says it does, and what a person can refuse are the same thing.

## Hard constraints

- Nothing this system runs opens a network listener, and nothing it runs sends anything anywhere. After this change that is a property of the code, not a promise in a document.
- No command sends a person's address, account or organisation to any destination.
- A person can refuse measurement without modifying a file their repository tracks. The refusal works at the level of the person, not only of the project, and it wins over any setting a repository carries.
- Turning measurement on for everyone who clones a repository is stated as that, at the moment it is done, and confirmed — held to the same standard the system already applies to the smaller version of the same act.
- A record already written and stored stays readable, whatever produced it. Removing a way of writing never removes a way of reading.
- Every diagnostic claim is about the one route that exists. A healthy installation reports no failure.
- Every breakdown a person can copy out of the report carries what it needs to be read correctly on its own. A figure that means something different from the figure beside it says so in the table, not only in the terminal.
- A report says whether measurement is on. A count that was never measured is never printed as zero.
- Every sentence in shipped text about what is recorded, what is sent, and who is named is true of the code. Where a document lists what the system writes, the list is complete.
- Whether an identity is carried as a name or as a pseudonym is still not decided here.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Computing an amount in currency from token counts. That is a separate contract, and this change removes the one route that ever carried an amount, so the report reports fewer amounts than before, honestly, rather than estimating any.
- Any hosted account, upload, or server-issued identity.
- Deciding whether measurement should default on or off for a project.
- Changing what the run journal records, or what the report's figures mean.
- Removing the ability to read a stored record that an earlier version produced.

## Done-when

- No command in the system starts a server, and no command writes an export destination into any tool's settings.
- A person who sets a refusal in their own environment is not measured, in a repository whose tracked configuration turns measurement on.
- Turning measurement on for a whole repository requires the same explicit confirmation as the narrower act already does, and says what it means before doing it.
- A stored record produced by the removed route is still read, still counted, and still reported.
- Running the diagnostic on a working installation reports no failure and recommends nothing that no longer exists.
- A person who copies the step breakdown out of the report cannot read one step's figure as the whole of that step.
- Running the report with measurement off says so.
- These five known-false statements are true when checked against the code: the root README's "nothing leaves your machine"; the plugin README's account of what is sent; `telemetry on`'s own claim that the journal names who worked on what; the journal document's list of what the journal writes; and the cost skill's promise to answer what is owed.
- The diagnostic skill describes the claims the diagnostic actually prints, in the number it prints them.

## Stakeholders

- Decider: the repository owner, for the amount-in-currency question this change defers and for the default-on question it does not touch.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person measuring their own work, and a contributor who wants no part of it.

## Context

- Measured on the machine that built this system: 34 stored records, every one produced by reading a tool's own files, none by the removed route, and none carrying an amount. The route being removed has never produced a record here.
- The removed route is also the only one that ever sent an address off the machine, and the only one that opened a port.
- The diagnostic currently reports two failures out of six on a working installation, because two of its claims grade the removed route. The remedy a person infers from them is to configure that route.
- The root README already states that nothing leaves the machine. Today that sentence is false; after this change it is true. The same is true of several others: this change is as much about making existing sentences true as about deleting code.
- An amount in currency now has no route at all. That is a real loss, taken deliberately: a price table applied to token counts would give an amount for every tool rather than for one, without a network, and is a separate piece of work.
