---
status: done
---

# A skill links only inside itself

## The defect

`architecture.md` has stated the rule since the per-tool distributions landed:

> A skill never links outside itself: the tree ships both flat and as a marketplace, so no
> relative path survives both.

Nothing enforced it, and the one checker that looks at links cannot:
`check-markdown-links.js` resolves every path against this repository, where the target does
exist. A link reaching out of a skill is green there and dead in every installed copy.

Five had accumulated:

| File | Link |
| --- | --- |
| `aidd-dev/skills/01-plan/SKILL.md` | `../../../../aidd_docs/runs/README.md` |
| `aidd-telemetry/skills/01-cost/actions/03-report.md` | `../../../../../aidd_docs/product/cost-report-contract.md` × 3 |
| `aidd-telemetry/skills/01-cost/actions/03-report.md` | `../../../README.md` |

Three of them point at `aidd_docs/product/cost-report-contract.md`, which no plugin ships at
all — the reader of an installed `aidd-telemetry` is sent to a file that was never in the
package.

**The boundary is the skill, not the plugin.** `../../../README.md` stays inside
`plugins/aidd-telemetry/`, and is still wrong: a tool installs a skill somewhere of its own
choosing, and the plugin's README is no more reachable from there than the repository is.

## The change

Every one of the five becomes a name in prose. A reader can search for a name; a name cannot
rot into a broken link.

## The guard

`scripts/__tests__/a-skill-links-only-inside-itself.test.js`. Every markdown file under
`plugins/<plugin>/skills/<skill>/` is read, every relative link resolved, and one that lands
outside that skill's own directory fails.

It ships with a second test that puts an escaping link in front of it and requires it to be
seen — without that, a boundary check that never trips reads exactly like a clean tree, which
is the state `check-markdown-links.js` was already reporting.

| Guard | Mutation that killed it |
| --- | --- |
| no link leaves its own skill | make the boundary check never trip — 1 |
| the boundary is the skill, not the plugin | widen it to `plugins/<plugin>` — 1 |

Both were killed by the probe test, which is the point of it.

CI runs it: `cli CI` filters on `scripts/__tests__/**` and executes
`node --test "scripts/__tests__/*.test.js"`, as does lefthook's pre-commit.
