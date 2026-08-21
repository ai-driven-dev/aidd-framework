# 03 - Prove it is recording

Check that a session is really being journalled, rather than trusting that the switch was enough.

## Input

The project, with its switch on.

## Output

Evidence that a session is recorded, or a named reason why none is.

## Process

1. **Look for a run file.** Run `ls aidd_docs/runs/*.jsonl`.
   - None, and the switch was just turned on: expected, since the hook writes at the next session start. Ask for a new session and stop, without reporting a failure.
   - None, and the switch has been on a while: the hook is not running, which is the host tool failing to register the plugin's hooks rather than a measurement problem.
2. **Read one back.** A run file's first line names the tool, the project and the session, and its `step_start` lines name the skills that have run.
3. **Hand over.** Answering what those sessions consumed belongs to another skill, and this one reports no figures.

## Test

| Case | Pass |
| --- | --- |
| Just turned on | it asks for a new session and reports no failure |
| A session has run | it shows the run file and what that file names |
| On a while with no run file | it names the unregistered hook, not the measurement |
