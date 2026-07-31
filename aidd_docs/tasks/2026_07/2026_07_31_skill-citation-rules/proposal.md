# Citation rules for generated skills

Branch `docs/skill-generate-citation-rules`, worktree `.claude/worktrees/skill-citations`, based on `origin/next` (`c2c2c942`).

## What was reported

`04-skill-generate` does not tell the author to use markdown links, and does not
tell the author to cite references inside the process steps rather than outside.

## What the code says

**Claim 1 is half true.** The rule exists, but only one, and only for one edge:

`plugins/aidd-context/skills/04-skill-generate/references/skill-authoring.md:10`

> **R6.** One fact, one home. An action acts within a router rule and cites a
> shared reference by a markdown link `[name](path)`, never restating either.

It covers action to reference only. Nothing covers router to action, action to
asset, or a reference citing an asset. Neither template mentions a link, so an
author filling `assets/action-template.md` never meets R6 unless they open the
contract, which `actions/03-write.md:19` does route them through.

**Claim 2 is true.** No rule states where a citation goes. R6 says "cites",
never "where". `assets/action-template.md` has no slot for it. The only signal
is example: `actions/01-scope.md:13`, `03-write.md:16`, `04-validate.md:15` all
cite inside a step. Convention by imitation, never written down.

## What the fleet says

The contract is local to `04-skill-generate`, so no sibling generator inherits
it. Scan over `plugins/*/skills/*/actions/*.md` on `origin/next`:

| Notation                               | Count in actions | Where                                                             |
| -------------------------------------- | ---------------- | ----------------------------------------------------------------- |
| `` `@../references/x.md` `` backticked  | 135              | `aidd-context` 75, `aidd-dev` 26, `aidd-refine` 17, `aidd-pm` 13, `aidd-vcs` 4 |
| markdown link to `../references/x.md`  | 24 files         | mostly `aidd-context`, `aidd-pm`                                  |

Counting every markdown file in `plugins/`, not just actions, the `@` total is 144.

`aidd-context/CHANGELOG.md:13` records the migration ("action citations use
markdown links, not @"), but it only landed on part of `aidd-context`.
`08-hook-generate`, a generator in the same plugin, is still fully on `@`:
`actions/02-write-hook.md:15-19`, `01-capture-hook.md:22-27`.

Placement is not the fleet's problem. Counting both notations across the 120
action files, 19 citations sit outside `## Process`, spread over 17 files. Every
one is at its point of use: an `## Input` bullet naming what defines it, an
`## Output` line naming the shape produced, a `## Test` asserting conformance,
or a one-line preamble naming the heuristics the action applies. Three of the 19
are `04-skill-generate`'s own (`01-scope.md` Output, `03-write.md` Test,
`04-validate.md` Test).

A `## Process` only rule would therefore break 17 files including the contract's
own skill, and `04-validate`'s test ("No file breaches skill-authoring.md")
would flag its own source. Point of use is the rule that matches the intent
without that contradiction.

Nothing in the fleet gathers its citations into a list of its own, which is the
failure mode the report describes. The rule lands as a generation-time guardrail
with zero cleanup attached.

## Why markdown over `@`

Inside a skill body `@path` is inert text. It resolves in a `CLAUDE.md` import
and in some editor chat inputs, nowhere else. A relative markdown link is what
an agent follows and what `markdownlint` and the repo link checker verify. `@`
citations are invisible to both, so a stale one rots silently.

## Options

A and B are quoted as first drafted. Two of their clauses did not survive
contact with the files; see [What shipped](#what-shipped).

### A. Fix the contract only

Rewrite R6, no renumber, no other file touched:

```md
- **R6.** One fact, one home. An action acts within a router rule and cites a
  shared reference, never restating either. Every citation is a relative
  markdown link `[name](path)`, written in the step or check that consumes it,
  never collected in a list of its own.
```

Plus `skill-authoring.md:6`, where R2 says "Named per `naming.md`" in backticks
and would breach the rule one line above it, becomes a markdown link to
`naming.md`.

Cost: 2 lines. Effect: generation time guardrail only, fleet unchanged.

### B. A, plus close the notation gap the contract leaves open

Same as A, and widen the citation sentence past action to reference so router
to action and anything to asset are covered too. `assets/` links included, since
a template is fetched by path like a reference is.

Cost: same 2 lines, wider wording. Risk: R7 says a template holds no rule, so
still nothing lands in the templates. An author who fills a template blind stays
uncovered either way, which is a separate discoverability problem.

### C. B, plus migrate the fleet

Convert the 135 `@path` citations in actions (144 across every markdown file
under `plugins/`) to markdown links, so the contract and the shipped skills
agree. Notation only: the placement scan found nothing to relocate.

Cost: mechanical, wide diff, touches 6 plugins. Should be its own PR with a
link check run after, not folded into a doc fix.

## What shipped

B, with three corrections found while applying it.

R6 now reads:

> **R6.** One fact, one home. An action acts within a router rule and cites a
> shared reference, never restating either. Every citation an action makes,
> reference or asset alike, is a relative markdown link `[name](path)`. A
> citation sits where it is used, never gathered in a list of its own.

R8 gains its missing half:

> **R8.** … Each stands alone, never pulling in another. It names a sibling in
> backticks and never links it.

Correction 1: "in the step or check that consumes it" was too narrow. It broke
`01-scope.md`, whose `## Output` cites `scope-frame.md` at its point of use.
"Sits where it is used" keeps the intent and drops the false positive.

Correction 2: the rule covers the actions, not the router. No router in the
repo cites a path (`grep '](\.\|`@' plugins/*/skills/*/SKILL.md` returns
nothing), and `skill-template.md`'s action table names slugs on purpose.
Naming the router would only have invited a reviewer to flag that table.

Correction 3: R2's `` `naming.md` `` stays in backticks, and so does
`review-protocol.md:6`. Making the link rule global would have forced a
reference to link a sibling reference, which R8 forbids. The link rule is
therefore scoped to the actions, and R8 now states the counterpart explicitly
instead of leaving it to be inferred.

Why the migration looked missing: commit `7661980` scoped itself to the action
files of `skill-generate` and `project-memory`, as its own message says. Both
are at zero `@` today. Every other skill was never in scope, and the contract
being local to `04-skill-generate` means none of them inherited R6 after the
fact.

## C, same PR

Decision: C ships with B rather than as a follow up, so the contract and the
fleet land in one state.

143 citations in total: 135 backticked, of which 133 converted, one glob and
one literal `@` left alone, plus eight fenced ones inlined.

The 133 were converted across 57 action files by a fence-aware script: every
`` `@<relative path>` `` became `[<file name>](<relative path>)`. The link text
is the file name, matching what `7661980` already established in
`skill-generate` and `project-memory`. Surrounding parentheses were kept, so the
diff is one line per citation and no sentence was restructured.

Three cases the script left alone, handled by hand, plus one sibling-action
citation it converted like any other:

- `12-cook/actions/01-list.md:22` cited a glob, `@../assets/recipes/*.md`. A
  glob is not a citation and no link expresses it, so the `@` is dropped and the
  backticks stay. Line 21 right above it already reads
  `` `aidd_docs/recipes/*.md` ``, so the two now match.
- `09-for-sure/actions/01-init-tracking.md:27` cited a sibling action, not a
  reference. Converted like the rest, since R6 covers everything an action
  cites.
- `00-onboard/actions/03-present.md:26` uses `@` as a literal character in a
  list of keys the host reserves. Untouched.
- `05-rule-generate/references/tool-paths.md:15` named a sibling reference as
  `` `@rule-authoring.md` ``. The `@` is dropped, backticks kept, per R8.

Eight more, never part of the 135 because they carry no backticks: a bare
`@<path>` alone inside a fenced block, in `12-cook` and `00-repo-init`. The
first pass carved them out as load mechanics. That was wrong. Nothing parses
them, a fenced link renders as literal text, and `02-upsert.md` stacked three of
them in a block above `## Input` with no step naming any: the exact shape R6's
third sentence now forbids. All eight are inlined into the step that consumes
them and the fences are gone.

- `01-list.md` cited `recipe-locations.md` in a preamble fence. Now in the
  one-line description, which is what names the two homes it reads.
- `02-upsert.md` stacked `recipe-locations.md`, `recipe-template.md`, and
  `recipe-contract.md`. The first was already cited at step 3; the other two
  move to step 7, which scaffolds and applies them.
- `03-research.md` had one fence per step. Each becomes a link inside its step.
- `00-repo-init/01-init.md` cited the `CONTRIBUTING.md` template in a fence
  under step 4. Now inline in step 4.

Out of scope: `@claude` in `aidd-orchestrator` (a GitHub mention the routing
regex matches) and `@playwright/mcp` in a cook recipe (an npm scope). Neither is
a citation.

Verification: a resolver over every relative link under `plugins/*/skills/`
reports 200 links, 0 broken among the converted set. The two it flags,
`plan-template.md:21-22` pointing at `./phase-1.md`, are pre-existing scaffold
placeholders in an asset the migration never touched. The repo's own `markdown-links` pre-commit hook
(lefthook) agrees: 561 files, 0 broken. No CLI test asserts on the `@` form
either (`grep -rn '@\.\./references\|@\.\./assets' cli/src cli/tests` is
empty).

## What is not fixed

`skill-authoring.md` stays local to `04-skill-generate`. The other generators
(`05-rule-generate`, `06-agent-generate`, `07-command-generate`,
`08-hook-generate`) each carry their own `*-authoring.md` and inherit nothing,
so R6 does not reach what they emit. This conversion holds until one of them
generates the next skill. Propagating the contract is a separate subject, not
folded in here.

Not in scope either way: putting a citation reminder into
`assets/action-template.md`. R7 forbids a template holding a rule, and
`actions/03-write.md:19` already routes the writer through the contract.
