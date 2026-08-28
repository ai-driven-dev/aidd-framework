# Memory block markers that cannot silently stop loading

The `<aidd_project_memory>` block that `update_memory.js` writes into every AI context file is delimited by a bare XML-style tag on its own line. Markdown treats that as an HTML block running until the next blank line, and Claude Code's import parser skips imports inside it exactly as it skips a fenced code block. Every `@aidd_docs/memory/*.md` line the hook generates is therefore ignored, and the project memory never loads. The failure is invisible from inside a session: the agent starts, nothing is reported, and it simply reasons without the memory bank.

The fix is to stop delimiting the block with a construct whose correctness depends on an adjacent blank line, and use HTML comment markers instead. A comment closes on its own line, so nothing following it can ever be captured, whatever a formatter or a future rewrite does to the surrounding whitespace. The same hook already uses that convention for the memory README index. Existing installed repositories carry the old tag, so the change is only complete if the hook migrates them; otherwise the fix ships and those repositories stay dark while the changelog claims otherwise.

## What Is Clear

- Reported in issue #719 and confirmed independently: `CLAUDE.md:41-50` in this repository holds the glued shape, and a session loading it shows the `@` lines unexpanded, with eight memory files absent.
- Single emitter: `buildBlockContent` in `plugins/aidd-context/hooks/update_memory.js`. `updateMarkers` splices between two constant strings and needs no change when those strings change.
- The bug is the tag shape, not the content. `buildBlockContent` already pushes a blank line before the on-demand note, so that blank line terminates the HTML block and the on-demand list renders correctly. Only the `@` lines above it are swallowed. That asymmetry is the signature.
- Chosen shape: the existing `### Project memory` heading for human readers, with `<!-- aidd_project_memory:start -->` and `<!-- aidd_project_memory:end -->` as the machine anchors. The heading is prose the hook does not own; the markers stay the anchor.
- Rejected: adding a blank line after the opening tag. It is one character and needs no migration, but it is a load-bearing convention nothing in the file declares, and a rewrite already reverted it once.
- Migration is part of the fix, not a follow-up. The hook returns `null` when the close marker is absent and skips the file with no output, so every already-installed repository would silently stop syncing.
- The tag name is load-bearing beyond the hook and those references move with it: `plugins/aidd-context/skills/00-onboard/references/state/zones.md`, `plugins/aidd-context/skills/11-explore/actions/01-survey.md`, and the `02-project-memory` templates for `AGENTS.md`, `README.md`, and `memory/README.md`.
- A regression guard stays in scope: walk a context file line by line, track whether a line opens an HTML block, and fail when an `@` import is found inside one. Comment markers make this specific regression near-impossible, but the guard covers hand-written context files and future generators.
- Out of scope, its own ticket: generating a `CLAUDE.md` that contains `@AGENTS.md` for repositories that only have `AGENTS.md`. It adds a capability rather than fixing a defect, and it drags in the separate question of which context files the project owns.

## Still Open

- Assumption, unverified: the XML tag currently buys nothing the model uses. Whether the wrapper survives import resolution into the prompt in a form the model reads has not been checked. If it does, the heading in the chosen shape is the replacement cue.
- Whether the CLI test fixtures under `cli/tests/fixtures/**` that embed the old tag should be migrated with the rest or left pinned to the legacy shape as regression material.

## Next Move

Turn this into a change: new markers in the hook, a one-pass rewrite of the legacy tag before the splice, the template and documentation references moved to the new shape, and a check that fails when an import sits inside an HTML block.
