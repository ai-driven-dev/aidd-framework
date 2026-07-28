# 04 - Estimate impact

Rate each story for effort and for its impact on the existing system.

## Input

The drafted stories from `03-draft-stories`.

## Output

Each story annotated with its estimate or blocking spike, its dependencies, an impact rating of minor, major, or critic, and a one-line rationale for the impact.

## Process

1. **Estimate effort.** Assign story points reflecting relative size.
   - Send a story that is too large to size back to `02-split-epic`.
   - When an unknown blocks sizing, discover a capability that records or investigates it. Resume after resolution, or leave the story unsized with the spike as its dependency.
2. **Rate impact.** Assign minor, major, or critic per the impact scale in `@../references/rating.md`.
3. **Justify.** Write a one-line rationale for each impact rating.
4. **Record.** Fill the estimation block in `@../assets/user-story-template.md` for each story.

## Test

- Each estimable story carries a numeric story-point value.
- An unresolved story names its spike dependency and carries no invented points.
- Each story carries an impact rating in {minor, major, critic} with a one-line rationale.
