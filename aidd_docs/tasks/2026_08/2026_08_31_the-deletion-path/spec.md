# A person can remove what was measured about them, and is told what cannot be reached

## Target

A person removes, with this tool, the measurement it stored about them on their own machine — after being told exactly what will go, what will stay, and what no command can reach.

## Hard constraints

- What will be removed is stated before anything is removed, and removing requires the person to confirm after seeing it. A destructive act is never the default of a command that also does something else.
- What is stated is stated in terms a person can recognise: this project's journal is one thing, and this machine's stored records are another, spanning every project measured on it. That difference is named, never implied.
- What no command can reach is named in the same breath, precisely: a journal deliberately committed to a repository is in that repository's history, and removing it from the working tree does not remove it from history. It is never presented as removable.
- What is known about history is stated at its true strength. A journal tracked right now is certainly in history. A journal not tracked now may still be in history if it ever was, and that cannot be told apart from a journal never committed — so the weaker case is stated as the possibility it is, never as an all-clear.
- Nothing is removed outside the locations named, and that holds by construction rather than by testing: one resolution of the locations is what the person is shown AND what the removal acts on, so there is no second path that could disagree with the first. A removal that reaches beyond what it stated is the worst failure this can have, and must be impossible to express, not merely absent.
- What was removed is reported in counts a person can check against what they were shown.
- What could not be removed is reported too, per thing, and one failure never silently stops the rest.
- Removing works on damaged and unreadable files. That is exactly when a person needs it, and a file too broken to read is not a reason to leave it in place.
- The switch that allows measurement is not data and is never removed by this. Turning measurement off and removing what it recorded stay two separate acts.
- Nothing is removed that belongs to another person, and nothing outside what this tool itself wrote.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Rewriting git history, or offering to. What history holds is named and left alone.
- Removing anything from a destination outside this machine. No destination exists yet, and reaching one would be its own consent.
- Removing a tool's own transcripts or rollouts. Those belong to the tool that wrote them, not to this one.
- Selecting what to remove by period, project, person or any other axis. Choosing a subset is analysis; this removes what this tool stored, wholly, in the places it names.
- Turning measurement off, or on. That is its own command and stays untouched.

## Done-when

- A person is shown, before confirming, every location this tool would remove from and roughly what is in each, plus what cannot be reached.
- A skill answers a person who asks to have their measurement removed, and reaches this command rather than saying nothing exists.
- Nothing is removed without that confirmation.
- After removing, the person is told what went and what did not, in counts matching what they were shown.
- A project whose journal was committed to git is told that history keeps it, what that means, and that no command here changes it.
- A machine's stored records are described as spanning every project measured on it, before they are removed.
- A file too damaged to read is still removed, and reported as removed.
- A location that cannot be removed is reported, and every other location is still removed.
- The switch is untouched by all of this, and a person who removes everything can still turn measurement on again afterwards.
- The locations shown and the locations removed from are the same value, not two agreeing computations — so no input can make one differ from the other, including a path relocated by configuration.

## Stakeholders

- Decider: Baptiste LAFOURCADE, who reaffirmed #297's privacy clause in the decision this sits under.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person who measured their work and wants it gone, and one who needs to know what wanting it gone cannot achieve.

## Context

- This is the last unmet condition of #660 that can be built: *"The deletion path is described, including what git history makes irreversible."* Its other unmet condition is editorial.
- Today `aidd telemetry off` names where the data stays — the journal, and whatever was stored — and offers nothing that removes it. A person is told where their records are and cannot act on it.
- The primitives already exist and are already used: the sink can delete a day file, the identity store already removes its own file and answers whether one was there, and `VersionControl.listTrackedFiles` already tells whether the journal is tracked — `TelemetryOnUseCase.protectRunsDir` calls it on exactly that path. The run journal has no deletion of its own.
- The decision record this sits under reaffirms #297's privacy clause unchanged, which makes a person's control over their own records a right rather than a convenience, and places it locally: it is control, not analysis.
- A seventh command is justified here, where three were recently deleted for not being earned. The act is irreversible, and an irreversible act deserves its own name, its own help and its own confirmation rather than a flag on a command that also does something reversible.
