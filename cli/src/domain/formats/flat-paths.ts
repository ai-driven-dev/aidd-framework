/**
 * Tool-agnostic flat path primitives.
 *
 * All functions are pure (no I/O). Parameterized by a primary-dir prefix so that
 * claude, cursor, copilot, opencode, and codex all share the same path derivation
 * logic with different prefixes/extensions.
 */

/**
 * Returns the flat-output path for an agent file.
 * The source `.md` extension is stripped and replaced with `outputExt`.
 *
 * Flat mode is PLUGIN-PREFIXED single level: no `<plugin>/` directory segment,
 * but the plugin name is prepended to the leaf filename with a hyphen so tools
 * can discover the files and the plugin origin is preserved in the name.
 *
 * @param agentsPrefix - Full prefix for agents dir (e.g. ".github/agents/", ".claude/agents/")
 * @param plugin       - Plugin name (prepended to the output filename)
 * @param agentBaseName - Source basename without path (e.g. "implementer.md")
 * @param outputExt    - Output extension (e.g. ".agent.md", ".md")
 */
export function genericFlatAgentPath(
  agentsPrefix: string,
  plugin: string,
  agentBaseName: string,
  outputExt: string
): string {
  const withoutMd = agentBaseName.endsWith(".md") ? agentBaseName.slice(0, -3) : agentBaseName;
  return `${agentsPrefix}${plugin}-${withoutMd}${outputExt}`;
}

/**
 * Returns the flat-output path for a skill file (preserves the skill's internal subtree).
 *
 * Flat mode is PLUGIN-PREFIXED single level: no `<plugin>/` directory segment,
 * but the plugin name is prepended to the first path segment (the skill folder)
 * with a hyphen. Tools can discover skills at the expected depth and the plugin
 * origin is preserved in the folder name.
 *
 * Assumes every immediate child of `skills/` IS a self-contained skill folder — the
 * hyphen lands on that child's own name, so a non-skill sibling (a shared helper
 * directory, a manifest file) gets renamed exactly like one, breaking any relative
 * path that reaches it by its original name. True today for the four callers still on
 * this function (claude, cursor, codex, copilot's flat contracts in tool-contracts.ts);
 * false for OpenCode's aidd-telemetry, which is why opencode's flat contract uses
 * `genericFlatSkillTreePath` instead (#defect fixed alongside this comment).
 *
 * @param skillsPrefix - Full prefix for skills dir (e.g. ".github/skills/", ".claude/skills/")
 * @param plugin       - Plugin name (prepended to the skill folder segment)
 * @param skillRelPath - Path relative to the plugin's skills/ directory
 */
export function genericFlatSkillPath(
  skillsPrefix: string,
  plugin: string,
  skillRelPath: string
): string {
  return `${skillsPrefix}${plugin}-${skillRelPath}`;
}

/**
 * Returns the flat-output path for a skill file, nesting the plugin's ENTIRE skills/
 * subtree under one `<plugin>/` directory segment instead of hyphenating each
 * immediate child independently (contrast `genericFlatSkillPath`).
 *
 * Nothing below `skillsPrefix` is renamed: one segment is added in front of the tree and
 * every name under it survives. `genericFlatSkillPath` renames each immediate child instead,
 * and a script's `require()` is never rewritten (see plugin-content-translator.ts's
 * `TranslatedFile.verbatim` doc), so any path crossing a renamed name stops resolving there.
 *
 * This is the shape OpenCode installs today, and the one `genericFlatHooksScriptPath` uses
 * for a hook's own subtree. It does not license sharing code between skills: the four other
 * contracts do rename per child, and a plugin that relies on the tree staying intact is
 * installable by one tool out of five.
 *
 * @param skillsPrefix - Full prefix for skills dir (e.g. ".opencode/skills/")
 * @param plugin       - Plugin name (used as the nesting directory)
 * @param skillRelPath - Path relative to the plugin's skills/ directory
 */
export function genericFlatSkillTreePath(
  skillsPrefix: string,
  plugin: string,
  skillRelPath: string
): string {
  return `${skillsPrefix}${plugin}/${skillRelPath}`;
}

/**
 * Returns the flat-output path for the per-plugin hooks JSON file.
 *
 * @param hooksPrefix - Full prefix for hooks dir (e.g. ".github/hooks/")
 * @param plugin      - Plugin name
 */
export function genericFlatHooksFile(hooksPrefix: string, plugin: string): string {
  return `${hooksPrefix}${plugin}.hooks.json`;
}

/**
 * Returns the flat-output path for a sibling hooks script file.
 *
 * @param hooksPrefix   - Full prefix for hooks dir
 * @param plugin        - Plugin name
 * @param scriptRelPath - Path relative to the plugin's hooks/ directory
 */
export function genericFlatHooksScriptPath(
  hooksPrefix: string,
  plugin: string,
  scriptRelPath: string
): string {
  return `${hooksPrefix}${plugin}/${scriptRelPath}`;
}

/**
 * Returns the key prefix used when merging a plugin's MCP servers.
 * Includes trailing dash.
 */
export function flatMcpKeyPrefix(plugin: string): string {
  return `${plugin}-`;
}

/**
 * Returns the flat-output path for a hook file under a shared, non-namespaced
 * `flatHooksDir` — a loader that scans one directory for its own runtime module
 * (opencode's `.opencode/plugin/`), not a per-plugin subtree. No plugin segment is
 * added: two plugins delivering the same filename there collide by design, the same
 * way the tool's own loader would see them.
 *
 * @param flatHooksDir       - The tool's declared flat hooks directory, trailing slash included
 * @param hooksRelativePath  - A hook component's path, e.g. "hooks/journal.js"
 */
export function flatHooksSharedDirPath(flatHooksDir: string, hooksRelativePath: string): string {
  return `${flatHooksDir}${hooksRelativePath.replace(/^hooks\//, "")}`;
}
