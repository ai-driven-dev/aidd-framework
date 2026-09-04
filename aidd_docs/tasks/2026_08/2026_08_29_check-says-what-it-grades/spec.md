# The diagnostic says what it is grading, and never calls "not yet" broken

## Target

`aidd telemetry check` states what is in place before it grades whether anything was recorded, and distinguishes a chain that has not run yet from one that cannot run.

## Hard constraints

- The command states, before any verdict, what a person would otherwise have to find by hand: whether measurement is allowed here and from which file, whether that is a project's choice or this person's refusal, whether an identity is attached, and where records are kept.
- Stating what is in place never requires anything to have been measured. It answers on a machine where nothing has ever run.
- A project where measurement is allowed and the recorder is installed, but nothing has run yet, reports nothing to evaluate. It never reports a failure.
- A project where the recorder is declared nowhere this build knows to look reports a failure, and names the recorder as what is missing.
- The two are told apart by reading whether the recorder is declared, never by inferring it from the absence of records. An absence that has two causes is never reported as one of them.
- A declaration is reported as a declaration and never as proof: this build can read that a recorder was asked for, not that it will fire. Where a declaration is known to be silently dropped, the command says so rather than promising the recorder works.
- A person's own refusal is stated as theirs, and distinguished from a project that was never switched on. Both mean nothing is recorded; only one of them is a choice this person made.
- No new command. The command surface stays as it is.
- Nothing stated here is derived from a figure the report owns: this says what is in place, never what anything cost.
- Every part of what is stated survives one unreadable file. A location that cannot be read says so and costs only itself.
- Every stated behaviour is observable with no AI tool binary present, on every supported platform.

## Non-goals

- Reporting any cost, total or breakdown. That is the report's.
- A second command, or a flag that turns the command into a different one.
- Repairing anything the command finds. It says what is; acting is the person's.
- Changing which claims the chain is graded on, or their order.
- Detecting a recorder installed by a route this build does not know how to look at. What cannot be checked says so rather than being guessed.
- Proving a declared recorder will actually fire. The one measured case where a declaration is dropped — a headless run that never registers the plugin, documented on the Claude CLI adapter — is named, not solved here.
- Counting what is stored. A count is a figure, and figures are the report's.

## Done-when

- Running the command on a machine where nothing has ever been measured states where measurement would be allowed from, that no identity is attached, and where records would be kept — without reporting a failure about any of it.
- A project just switched on, with the recorder installed and no session yet, reports nothing to evaluate rather than a failure.
- The same project with the recorder declared nowhere reports a failure, and names the recorder as what is missing.
- A project whose recorder is declared but has never fired is told that a declaration is not proof, with the known reason it can be dropped.
- A person who refused sees that stated as their own refusal, distinct from a project nobody switched on.
- The command names the file each stated fact came from, so a person can go and change it.
- A stated fact whose file cannot be read says so, and every other stated fact still appears.
- No command was added.

## Stakeholders

- Decider: the repository owner.
- Owner: the AIDD CLI telemetry read path.
- Consumer: a person who turned measurement on and wants to know whether it is working, and a person who cannot tell why they see nothing.

## Context

- Measured today: on a project just switched on, with nothing yet recorded, the command reports `hook fired FAIL — the hook has never been observed firing`. That project is healthy. The verdict is wrong, and it is wrong in the direction that matters: it tells someone their setup is broken when it is merely new.
- The cause is that the absence of a run file has two causes — a recorder that is not installed, and a recorder that has not run yet — and the command reads the absence rather than the cause.
- What is readable is a *declaration*: the AIDD manifest records what `aidd plugin add` did, and a tool's own settings declare enabled plugins. Neither proves the hook will fire — `claude-cli-adapter.ts`'s own measured comment records that a declared entry is silently dropped as orphaned when a headless run never registers the plugin, which is #698 on the backlog. So this change makes the cause *stated* rather than inferred, and states its own strength; it does not make it certain.
- With measurement off, the command currently answers in one line and states nothing else: not where the switch is, not what turning it on would do, not what is already configured.
- This deliberately does not add a command. The gap is not a missing surface — it is that the existing one grades without ever saying what it is grading.
