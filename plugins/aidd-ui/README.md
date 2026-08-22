← [aidd-framework](../../README.md)

# aidd-ui 🚧 alpha

UI and UX decisions for the AI-Driven Development framework.

> **Alpha.** The concern is usable but experimental. Skill contracts may change, and the plugin remains off the curated install path.

`aidd-ui` turns product intent and current project evidence into reviewable, testable experience decisions. It reads durable project memory as a compact map, confirms it against the repository, and reports drift without changing memory.

```text
product intent + project context
  → interface decisions
  → experience contract
  → engineering implementation
```

Code says what exists. Memory says what is stable. UI decisions say what should happen next.

## Skills

| Skill | Produces |
| --- | --- |
| [design](skills/01-design/SKILL.md) | evidence-grounded interface structure and decisions |
| [review](skills/02-review/SKILL.md) | prioritized experience findings |
| [system](skills/03-system/SKILL.md) | a current system map or minimal extension |
| [accessibility](skills/04-accessibility/SKILL.md) | accessibility requirements or findings |
| [responsive](skills/05-responsive/SKILL.md) | constrained-space behavior or findings |
| [polish](skills/06-polish/SKILL.md) | bounded refinements after structure is settled |
| [handoff](skills/07-handoff/SKILL.md) | an implementation-ready `ui.md` experience contract |

Install the alpha plugin explicitly, then invoke the skill matching the required output:

```text
/plugin install aidd-ui@aidd-framework
/aidd-ui:01-design <request or requirements>
```

## Boundaries

- Product requirements remain upstream input.
- Durable conventions remain in project memory; this plugin never updates them silently.
- Production components, CSS, and application code remain engineering work.
- Existing page patterns, composites, primitives, tokens, and layout conventions are reused before extension or creation.
- No Figma, image generation, browser automation, visual-regression, or component-library infrastructure is bundled.
