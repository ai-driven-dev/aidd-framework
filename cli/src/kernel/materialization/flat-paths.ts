/**
 * Flat mode carries no `<plugin>/` directory segment: the plugin name is hyphen-prefixed
 * onto the leaf filename instead, so a tool discovers the file at the depth it expects and
 * the plugin origin still survives in the name.
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
 * Assumes every immediate child of `skills/` is a self-contained skill folder: the hyphen
 * lands on that child's own name, so a non-skill sibling (a shared helper directory, a
 * manifest file) is renamed exactly like one and any relative path reaching it by its
 * original name stops resolving. A plugin where that does not hold takes
 * `genericFlatSkillTreePath` instead.
 */
export function genericFlatSkillPath(
  skillsPrefix: string,
  plugin: string,
  skillRelPath: string
): string {
  return `${skillsPrefix}${plugin}-${skillRelPath}`;
}

/**
 * Nests the plugin's entire `skills/` subtree under one `<plugin>/` segment, so every name
 * below `skillsPrefix` survives — a script's `require()` is never rewritten, so a path
 * crossing a renamed name would stop resolving.
 */
export function genericFlatSkillTreePath(
  skillsPrefix: string,
  plugin: string,
  skillRelPath: string
): string {
  return `${skillsPrefix}${plugin}/${skillRelPath}`;
}

export function genericFlatHooksFile(hooksPrefix: string, plugin: string): string {
  return `${hooksPrefix}${plugin}.hooks.json`;
}

export function genericFlatHooksScriptPath(
  hooksPrefix: string,
  plugin: string,
  scriptRelPath: string
): string {
  return `${hooksPrefix}${plugin}/${scriptRelPath}`;
}

export function flatMcpKeyPrefix(plugin: string): string {
  return `${plugin}-`;
}

/**
 * A flat-mode loader's own module: the one hook script a plugin ships that the loader
 * imports as itself. Kept in its own directory, apart from the per-plugin hooks tree, so
 * renaming it to the plugin's name can never collide with another plugin shipping one.
 */
export interface FlatHooksLoaderEntry {
  readonly dir: string;
  readonly baseName: string;
}

/**
 * A script named `loaderEntry.baseName` is the loader's own runtime module (see
 * {@link FlatHooksLoaderEntry}): it lands flat in `loaderEntry.dir` under the plugin's own
 * name, so two plugins shipping one cannot collide. Every other script is namespaced under
 * `perPluginHooksDir`, giving a loader that also scans one flat directory a landing spot
 * for the scripts it does not import directly. `null` means no such convention.
 */
export function flatHooksPathWithLoaderEntry(
  perPluginHooksDir: string,
  loaderEntry: FlatHooksLoaderEntry | null,
  plugin: string,
  hooksRelativePath: string
): string {
  const rest = hooksRelativePath.replace(/^hooks\//, "");
  if (loaderEntry !== null && rest === loaderEntry.baseName) {
    return `${loaderEntry.dir}${plugin}.js`;
  }
  return genericFlatHooksScriptPath(perPluginHooksDir, plugin, rest);
}
