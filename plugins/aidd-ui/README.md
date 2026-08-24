← [aidd-framework](../../README.md)

# aidd-ui 🚧 alpha

UI experience and shared interface-system decisions for the AI-Driven Development framework.

> **Alpha.** Contracts may change, and the plugin remains off the curated install path.

`aidd-ui` owns what an interface and its shared UI system must preserve. It consumes product intent and hands implementation ready decisions to engineering.

```text
product intent + current evidence
  → shared UI system contract
  → feature UI contract
  → engineering implementation
  → experience review
```

Code is current implementation truth. Project memory is a compact stable map. UI contracts are decision authority.

## Skills

| Skill | Owns | Produces |
| --- | --- | --- |
| [system](skills/01-system/SKILL.md) | shared UI system lifecycle | system maps, versioned contracts, and lifecycle deltas |
| [design](skills/02-design/SKILL.md) | feature experience decisions | versioned `ui.md` |
| [review](skills/03-review/SKILL.md) | feature experience diagnosis and priority | non-normative `ui-review.md` |
| [accessibility](skills/04-accessibility/SKILL.md) | accessibility requirements and verdicts | typed specialist fragments |
| [adapt](skills/05-adapt/SKILL.md) | space, input, and platform transformations | typed specialist fragments |

`01-system` stores the current shared contract at `aidd_docs/ui/systems/<system-id>.md`, immutable prior revisions under `.history/`, and one task local `system-delta-<system-id>-<delta-id>.md` per proposed change. It decides the system. Engineering implements its sources and verification conditions.

Install explicitly, then invoke the capability matching the decision owner:

```text
/plugin install aidd-ui@aidd-framework
/aidd-ui:01-system discover
/aidd-ui:02-design create
```

## Boundaries

- Product requirements are consumed, not authored here.
- Project memory is read only. Drift is reported for a separate refresh.
- Shared system and feature experience contracts are owned here, not source code.
- Engineering consumes ready contracts and owns implementation correctness.
- External design documents are evidence until explicitly adopted.
- Existing page patterns, composites, primitives, tokens, and layout conventions are reused before extension or creation.
- Assets may be contracted by role, source, constraints, and acceptance. Binary production remains outside this plugin.
- No design tool integration, image generation, browser automation, visual regression, component library, or token build pipeline is bundled.
