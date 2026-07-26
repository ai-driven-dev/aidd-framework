<!-- Cited by upsert. The rules every recipe file follows. -->

# Recipe contract

Rules for every recipe file the skill writes.

## File

- Project path: `aidd_docs/recipes/<kebab-slug>.md`.
- Bundled path, only for explicit framework-source edits: `plugins/aidd-context/skills/12-cook/assets/recipes/<kebab-slug>.md`.
- The recipe opens with the H1 title, then one plain sentence of description — no "Goal:" label, no blockquote, no metadata table.
- Sections: the description, `## Why`, then the steps. `## Verify` is optional — omit it when it adds little. End with an optional short conclusion. Never add a `## Related` section: links live inline where they are used.

## Writing

- One idea per sentence. Prefer removing over adding.
- No filler line under a heading (no "Ranked by impact", "Start at the top", and the like).
- `## Why`: short and benefit-first, one idea per line. Lead with the keywords a reader would search, **bold** the key terms.

## Steps

- The steps section heading is named after the goal: `## Steps to <outcome>`, never a bare `## Steps`.
- Heading levels express nesting. Never skip a level: a heading may be at most one level deeper than the heading before it.
- One step = one action: never bundle several tools or commands under one heading; split them.
- A step directly under the steps section is a `### N) <emoji> Title` heading. A step grouped under a `###` category is a `#### N) <emoji> Title` heading. Number steps continuously.
- Write the actions to take as a numbered list; write any description or indication as prose, never as a bullet.
- For a tool: where it is, install it from its URL, then how to invoke it (its real command or slash invocation, e.g. `/caveman`).
- Reuse the tool's canonical example captured verbatim from its site or README — never a paraphrase, and never on the strength of a summary that says one exists.
- Every step carries one concrete example. Prefer an image — a screenshot or short video/GIF that matches the action — over text whenever one exists; for a tool, use its official screenshot. Otherwise: a command with its real output, a config in the file's real syntax (valid JSON for `settings.json`, valid YAML for frontmatter, …), or a snippet.
- A step that prefers one option over another uses a comparison table, not prose.
- For a structural or flow concept (a proxy, a pipeline, an architecture), add a small Mermaid diagram with concrete example values.
- Level subheadings are optional. Group steps under `### 🟢 Beginner`, `### 🟡 Intermediate`, `### 🔴 Expert` only when the recipe spans difficulty levels and grouping helps the reader; their steps use `####`. A short or single-level recipe lists its steps directly with `###`. Include only the levels that have a step.
- Link to a reference when applicable.
