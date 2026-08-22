# aidd-ui catalog

Auto-generated index of skills, agents, references and assets shipped by the `aidd-ui` plugin.

> This file is automatically updated by the `scripts/summarize-markdown.js` script.

## Table of Contents

- [`.claude-plugin`](#claude-plugin)
- [`skills`](#skills)
  - [`skills/01-design`](#skills01-design)
  - [`skills/02-review`](#skills02-review)
  - [`skills/03-system`](#skills03-system)
  - [`skills/04-accessibility`](#skills04-accessibility)
  - [`skills/05-responsive`](#skills05-responsive)
  - [`skills/06-polish`](#skills06-polish)
  - [`skills/07-handoff`](#skills07-handoff)

---

### `.claude-plugin`

| File |
|------|
| [plugin.json](.claude-plugin/plugin.json) |

### `skills`

#### `skills/01-design`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-frame.md](skills/01-design/actions/01-frame.md) | - |
| `actions` | [02-inspect.md](skills/01-design/actions/02-inspect.md) | - |
| `actions` | [03-structure.md](skills/01-design/actions/03-structure.md) | - |
| `actions` | [04-compose.md](skills/01-design/actions/04-compose.md) | - |
| `actions` | [05-validate.md](skills/01-design/actions/05-validate.md) | - |
| `references` | [evidence.md](skills/01-design/references/evidence.md) | - |
| `-` | [SKILL.md](skills/01-design/SKILL.md) | `Produces evidence-grounded structure, interaction, visual-system, state, and validation decisions. Use when the user wants to design or redesign an interface from product intent. Not for production frontend implementation.` |

#### `skills/02-review`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-inspect.md](skills/02-review/actions/01-inspect.md) | - |
| `actions` | [02-assess.md](skills/02-review/actions/02-assess.md) | - |
| `references` | [findings.md](skills/02-review/references/findings.md) | - |
| `-` | [SKILL.md](skills/02-review/SKILL.md) | `Produces prioritized, evidence-based findings about interface experience quality. Use when the user wants to review an existing screen, flow, or UI implementation. Not for general engineering correctness or code quality.` |

#### `skills/03-system`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-inspect.md](skills/03-system/actions/01-inspect.md) | - |
| `actions` | [02-map.md](skills/03-system/actions/02-map.md) | - |
| `actions` | [03-decide.md](skills/03-system/actions/03-decide.md) | - |
| `-` | [SKILL.md](skills/03-system/SKILL.md) | `Maps an existing interface system or defines its smallest coherent extension. Use when the user wants to discover design conventions or adapt them for a new interface need. Not for broad visual redesign or component implementation.` |

#### `skills/04-accessibility`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-inspect.md](skills/04-accessibility/actions/01-inspect.md) | - |
| `actions` | [02-specify.md](skills/04-accessibility/actions/02-specify.md) | - |
| `actions` | [03-assess.md](skills/04-accessibility/actions/03-assess.md) | - |
| `-` | [SKILL.md](skills/04-accessibility/SKILL.md) | `Defines interface accessibility requirements or reviews an interface against observable evidence. Use when the user wants focused semantic, keyboard, focus, naming, contrast, error, touch, or motion decisions.` |

#### `skills/05-responsive`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-inspect.md](skills/05-responsive/actions/01-inspect.md) | - |
| `actions` | [02-specify.md](skills/05-responsive/actions/02-specify.md) | - |
| `actions` | [03-assess.md](skills/05-responsive/actions/03-assess.md) | - |
| `-` | [SKILL.md](skills/05-responsive/SKILL.md) | `Defines or reviews interface behavior under constrained space and changing input contexts. Use when the user wants explicit layout, density, navigation, action, overflow, touch, or breakpoint decisions.` |

#### `skills/06-polish`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-refine.md](skills/06-polish/actions/01-refine.md) | - |
| `-` | [SKILL.md](skills/06-polish/SKILL.md) | `Produces a bounded visual and interaction refinement delta after structure and behavior are settled. Use when the user wants to improve hierarchy, rhythm, consistency, feedback, density, or affordance without redesigning the experience.` |

#### `skills/07-handoff`

| Group | File | Description |
|-------|------|---|
| `actions` | [01-compile.md](skills/07-handoff/actions/01-compile.md) | - |
| `actions` | [02-verify.md](skills/07-handoff/actions/02-verify.md) | - |
| `assets` | [ui-contract.md](skills/07-handoff/assets/ui-contract.md) | - |
| `-` | [SKILL.md](skills/07-handoff/SKILL.md) | `Compiles confirmed UI decisions into a minimal implementation-ready experience contract. Use when the user wants to hand interface behavior and constraints to engineering. Not for inventing product requirements, redesigning, or writing production code.` |

