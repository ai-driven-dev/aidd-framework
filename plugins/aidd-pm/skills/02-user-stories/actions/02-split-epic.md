# 02 - Split epic

Decompose the confirmed scope into candidate stories, each a vertical slice that delivers value on its own.

## Input

The confirmed scope statement and epic-or-single flag from `01-clarify-scope`.

## Output

An ordered list of candidate stories, each a title plus a one-line user goal. A single-story request yields exactly one candidate.

## Process

1. **Branch.** If the flag marks a single story, emit one candidate from the scope and stop. Otherwise continue.
2. **Slice.** Cut the epic along user outcomes, not technical layers. Each slice must deliver something a user can perceive.
3. **Check independence.** Reshape any slice that cannot ship without another, so each candidate stands alone (see [rating.md](../references/rating.md)).
4. **Name.** Give each candidate a short title and a one-line goal in user terms.
5. **Confirm.** Show the candidate list and wait for the user to confirm before handing to `03-draft-stories`.

## Test

- Each candidate is a vertical slice with a user-perceivable outcome.
- A single-story input produces exactly one candidate.
- No candidate depends on another candidate to deliver its value.
