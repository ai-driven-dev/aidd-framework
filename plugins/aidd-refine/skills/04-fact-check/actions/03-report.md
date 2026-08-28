# 03 - Report

Rewrite the original text on the evidence: cite verified claims, hedge unverified ones, surface conflicts. The output is reader-facing prose only.

## Input

- The verdicts from `02-verify`.
- The original text, reused as the base for the rewrite.

## Output

The rewritten answer per [report-template.md](../assets/report-template.md), obeying [report-output-discipline.md](../references/report-output-discipline.md).

## Process

1. **Copy.** Start from [report-template.md](../assets/report-template.md).
2. **Rewrite.** Carry the original text over, appending `[n]` to each verified claim, numbered in reading order. Replace each refuted claim with the corrected fact and cite the contradicting source `[n]`; never restate the false claim as true.
3. **Surface.** For each conflict, state both sides in full ("Source A reports X; source B reports Y"), choosing no winner.
4. **Mark.** Append the exact marker `(unverified - no source found)`, verbatim and unreworded, to each unverified claim. Never delete it, never assert it.
5. **Cite.** Build the `## Sources` block: one numbered entry per source, with its title or file path, location, and the claim it backs. Each side of a conflict gets its own entry.
6. **List.** Add the `## Unverified claims` section only when at least one claim is unverified; otherwise omit it.
7. **Suggest.** When a verified fact is stable (project paths, pinned-version APIs), append one cache-suggestion line with a yes/no recommendation. The skill stores nothing itself: on approval, restate the fact and its source so the user's own memory tooling can keep it. When nothing qualifies, omit the line silently.
8. **Scrub.** Before delivering, re-read the draft line by line against [report-output-discipline.md](../references/report-output-discipline.md): delete any line that carries a forbidden item, and re-render in plain prose any line an active output mode restyled. Ship plain prose whatever the surrounding style.

## Test

- Given one verified claim and one unverified claim, the output carries a `## Sources` section with a `[1]` footnote for the verified claim, an inline `(unverified - no source found)` marker on the other, and none of the forbidden words from [report-output-discipline.md](../references/report-output-discipline.md).
