# Product Brief Skill Headless Test

Date: 2026-07-28 to 2026-07-29
Runner: Codex `gpt-5.5` and `gpt-5.6-sol`, medium reasoning, isolated workspaces

## Result

The baseline passed 33 scenarios and 104/104 assertions. The final installed-skill regression passed 9 scenarios and 39/39 assertions. Critical routing branches passed three consecutive runs.

| Area | Cases | Result |
| --- | --- | --- |
| Frame | implicit trigger, no idea, sparse idea, existing product, conflicting or ambiguous sources | Pass |
| Discover | assumptions, correction loop, declined research, unsupported claim, external official research, new evidence | Pass |
| Visualize | omit when useless, Mermaid, ASCII wireframe, comparison table, visual revision | Pass |
| Shape | required headings, optional sections, feedback loop, no invented metric, no placeholders | Pass |
| Finalize | unapproved, content-only approval, session-only, approved create or update, write failure | Pass |
| Metadata | initial current brief, in-place update, reciprocal supersession, omitted optional relations | Pass |
| Integration | multi-turn discovery, visual and approval loops, PRD handoff, partial or missing source, installed trigger | Pass |
| Loading | blank, non-visual and persisted routes read only their required files | Pass |

## Findings Fixed

1. A comparison table initially created `## Alternatives` and renamed required sections. Visuals are now constrained to `Product View`; required headings and order are explicit.
2. The installed no-idea route initially requested a field checklist. `frame` now asks only for the idea in plain language.
3. Some responses exposed action labels or stopped on a draft. User-facing workflow labels are hidden and every draft now reaches the open feedback step.
4. Content approval could silently become session-only. The skill now asks separately whether to persist.
5. An incompatible wireframe request could produce a substitute pseudo-screen. The visual route now stops when the product has no relevant interface.
6. Two current briefs could be resolved by date. Authority selection now belongs to `frame`; date is not evidence.

All failing cases passed after their fixes.

## Independent Checks

- Generated Mermaid parsed with `mmdc`.
- Approved creation wrote exactly one `product-brief.md` with no placeholders.
- Approved update preserved the custom `Team Notes` section and changed only the approved boundary.
- Unapproved, ambiguous, failed-write and session-only cases wrote no files.
- Existing brief ambiguity stopped before modifying either file.
- New interview evidence reopened discovery and challenged the previous hypothesis.
- A corrected audience and pain replaced, rather than accumulated with, obsolete assumptions.
- External research used official EU sources and kept the legal implication as a hypothesis.
- PRD consumed `product-brief.md` directly and preserved uncertainty under dependencies and open questions.
- A partial Product Brief became a PRD with explicit open questions; a missing brief stopped the handoff.
- Blank invocation loaded only the router, `frame`, and its evidence reference. Non-visual and session-only routes skipped unrelated references.
- The installed `06-product-brief` blank route asked one natural question and wrote no file.
- Installed `03-prd`, `04-spec`, and `05-spike` kept their names and source hashes.
- Markdown links: 0 broken in 560 files.
- `git diff --check`: pass.

## Reference Cleanup

The references were reduced from 803 to 537 words and separated by responsibility. The final regression covers evidence, shaping, technique selection, visuals, persistence metadata, supersession, and PRD handoff.
