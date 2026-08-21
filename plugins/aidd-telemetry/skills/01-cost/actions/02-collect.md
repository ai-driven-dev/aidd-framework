# 02 - Collect what the tools already wrote

Join each tool's own transcript to the run journal, and store the result.

## Input

The path to `telemetry-report.js`, from locate.

## Output

A stored set of this project's sessions, and a note of anything unreadable.

## Process

1. **Read every journalled session.** Run `node <telemetry-report.js> read`, which needs no session identifier because the journal already holds every one of them.
2. **Read the answer, one line per tool.** Five answers, and only one of them is a zero.

   | Reads | Means |
   | --- | --- |
   | `read (N new of M)` | it found records, `N` of them new, since a re-read stores nothing twice |
   | `read, nothing found` | it held the session and billed nothing, which is a real zero |
   | `no session found` | it has no trace of the session, so nothing is known |
   | `could not be read` | its reader failed, so nothing is known and something is wrong |
   | `not covered` | nothing here can read that tool, and its reason follows on the line |

3. **Carry a failure forward.** A tool reading `could not be read`, or a line ending in a count of sessions that could not be read, makes every figure that follows partial.
4. **Stop when nothing is journalled.** The output says so, which is the expected state before any session has run with measuring on.

## Test

| Case | Pass |
| --- | --- |
| Sessions have been journalled | it reports how many were read and what each tool gave |
| Run twice in a row | the second run stores nothing new |
| Nothing journalled yet | it says so and stops without inventing a figure |
