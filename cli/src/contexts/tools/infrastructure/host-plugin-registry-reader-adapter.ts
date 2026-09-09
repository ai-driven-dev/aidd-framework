import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describeError } from "../../../kernel/describe-error.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type {
  HostPluginRegistryEntry,
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../domain/ports/host-plugin-registry-reader.js";

/**
 * One reader per host whose own plugin registry was measured; a tool absent from the map is
 * one nothing here claims to know, and the diagnostic reports it unanswerable rather than
 * assuming it agrees. The shapes measured:
 *
 *   Claude Code  ~/.claude/plugins/installed_plugins.json   { version, plugins: { ref: [ … ] } }
 *   Codex        ~/.codex/config.toml                       [plugins."ref"] enabled = true
 *   Copilot      ~/.copilot/settings.json                   { enabledPlugins: { ref: true } }
 *
 * Copilot's registry is `settings.json`, never `config.json`, whose `installedPlugins` reads
 * empty on a machine that has run installs. `copilot plugin uninstall` sets a key to `false`
 * rather than deleting it, so registered-but-off is an ordinary state, not a Codex-only one.
 */
export function hostPluginRegistryReaders(
  home: string = resolveHomeDir()
): ReadonlyMap<AiToolId, HostPluginRegistryReader> {
  return new Map<AiToolId, HostPluginRegistryReader>([
    [
      "claude",
      new ClaudeInstalledPluginsReader(join(home, ".claude", "plugins", "installed_plugins.json")),
    ],
    ["codex", new CodexConfigPluginsReader(join(home, ".codex", "config.toml"))],
    ["copilot", new CopilotSettingsPluginsReader(join(home, ".copilot", "settings.json"))],
  ]);
}

/**
 * Claude Code's own registry: a JSON document whose `plugins` object is keyed by the same
 * `<plugin>@<marketplace>` ref `enabledPlugins` uses, each key holding one entry per scope the
 * ref was installed at. Presence is not the whole answer — an entry installed at a project
 * scope also carries `projectPath`, which is what tells one project's ref from a machine-wide
 * one.
 */
class ClaudeInstalledPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  async read(projectRoot: string): Promise<HostPluginRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    try {
      const parsed = JSON.parse(content) as { plugins?: Record<string, ClaudeEntry[]> };
      const plugins = parsed.plugins;
      if (plugins === undefined || typeof plugins !== "object") {
        return { location: this.path, unreadable: "no `plugins` object" };
      }
      const refs = new Map<string, HostPluginRegistryEntry>();
      const here = await resolvedPath(projectRoot);
      for (const [ref, entries] of Object.entries(plugins)) {
        const scope = await scopeForProject(entries, here);
        if (scope !== null) refs.set(ref, { enabled: true, scope });
      }
      return { location: this.path, refs };
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
  }
}

/**
 * Codex's own registry, line-scanned rather than parsed: the file carries arbitrary nested
 * tables and multi-line values this adapter has no business understanding, and most of it is
 * `[projects."<absolute path>"]` tables a diagnostic must not pull into a terminal. Only
 * `[plugins."<ref>"]` and the `enabled` key under it are read, and a `false` there is carried
 * through: a host that knows a plugin and declines it must not print like one that never
 * heard of it.
 */
class CodexConfigPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  // `projectRoot` is unused: Codex's plugin tables carry `enabled` and nothing else — no path,
  // no scope — so its registry answers for the machine and cannot answer for one project.
  async read(_projectRoot: string): Promise<HostPluginRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    return { location: this.path, refs: scanCodexPluginTables(content) };
  }
}

/**
 * Copilot's own registry: `enabledPlugins` in `~/.copilot/settings.json`, keyed on the same
 * `<plugin>@<marketplace>` ref as every other host and carrying a boolean. No project binding,
 * so like Codex it answers for the machine and cannot answer for one project.
 */
class CopilotSettingsPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  async read(_projectRoot: string): Promise<HostPluginRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    try {
      const parsed = JSON.parse(content) as { enabledPlugins?: Record<string, unknown> };
      const enabled = parsed.enabledPlugins;
      // Absent is a real answer here, unlike a file that would not open: Copilot writes the
      // key on its first install, so a settings file without one carries no plugin.
      if (enabled === undefined) return { location: this.path, refs: new Map() };
      return {
        location: this.path,
        refs: new Map(Object.entries(enabled).map(([ref, on]) => [ref, { enabled: on !== false }])),
      };
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
  }
}

const CODEX_PLUGIN_HEADER = /^\[plugins\."(.+?)"\]\s*(?:#.*)?$/u;
const CODEX_TABLE_HEADER = /^\[/u;
const CODEX_ENABLED_LINE = /^enabled\s*=\s*(true|false)\s*(?:#.*)?$/u;
const CODEX_MULTILINE_DELIMITER = /"""|'''/gu;

/**
 * Reads each plugin table's body, and only outside multi-line strings: a header spelled inside
 * one would otherwise be taken for the real table, and keeping the first occurrence of a ref
 * cannot tell a fake header from a real one. Skipping them leaves exactly one real header,
 * which TOML's own prohibition on defining a table twice then guarantees.
 *
 * Absent `enabled` reads as enabled: Codex writes the key on every table it creates, so
 * between "the host listed this plugin" and "listed it and said nothing", the listing is the
 * fact.
 */
function scanCodexPluginTables(content: string): ReadonlyMap<string, HostPluginRegistryEntry> {
  const refs = new Map<string, HostPluginRegistryEntry>();
  const lines = outsideMultilineStrings(content.split("\n"));
  for (const [index, line] of lines.entries()) {
    if (line === null) continue;
    const ref = CODEX_PLUGIN_HEADER.exec(line.trim())?.[1];
    if (ref === undefined || refs.has(ref)) continue;
    refs.set(ref, { enabled: enabledInTableBody(lines, index + 1) });
  }
  return refs;
}

/**
 * The same lines, with every one inside a multi-line string replaced by `null`. Positions are
 * preserved rather than filtered out, so a table's body still begins at the line after its
 * header; a delimiter can open and close on one line, so an odd count on a line is what flips
 * the state, and the line carrying the opening delimiter is itself outside — it is the
 * assignment, not the content.
 */
function outsideMultilineStrings(lines: readonly string[]): readonly (string | null)[] {
  let inside = false;
  return lines.map((line) => {
    const wasInside = inside;
    const delimiters = line.match(CODEX_MULTILINE_DELIMITER)?.length ?? 0;
    if (delimiters % 2 === 1) inside = !inside;
    return wasInside ? null : line;
  });
}

/** The first `enabled` assignment between a table header and the next table, defaulting to
 * enabled when the table declares none. A line inside a multi-line string is `null` here and
 * neither ends the table nor answers for it. */
function enabledInTableBody(lines: readonly (string | null)[], from: number): boolean {
  for (let at = from; at < lines.length; at += 1) {
    const line = lines[at];
    if (line === null || line === undefined) continue;
    const trimmed = line.trim();
    if (CODEX_TABLE_HEADER.test(trimmed)) return true;
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const enabled = CODEX_ENABLED_LINE.exec(trimmed);
    if (enabled !== null) return enabled[1] === "true";
  }
  return true;
}

/** One installed-plugin entry, narrowed to the two fields that decide whether a ref counts for
 * the project being diagnosed. Everything else Claude records there describes what was
 * installed, never where it applies. */
interface ClaudeEntry {
  readonly scope?: string;
  readonly projectPath?: string;
}

/** A user-scoped entry applies everywhere and carries no `projectPath`; any other scope applies
 * to the project it names, and an entry with neither is ignored rather than guessed. `null`
 * when nothing here answers for `projectRoot`. A user-scope entry wins over a project-path
 * match whatever the array's order, so a caller choosing an uninstall's own scope reads the
 * answer that is true rather than the one that sorted first. */
async function scopeForProject(
  entries: readonly ClaudeEntry[],
  projectRoot: string
): Promise<MarketplaceScope | null> {
  if (!Array.isArray(entries)) return null;
  if (entries.some((entry) => entry.scope === "user")) return "user";
  for (const entry of entries) {
    if (entry.projectPath === undefined) continue;
    if ((await resolvedPath(entry.projectPath)) === projectRoot) return "project";
  }
  return null;
}

/**
 * Both sides of the project comparison resolve through `realpath`: on macOS `/var` is a symlink
 * to `/private/var`, and comparing the raw strings there reports a registered plugin as
 * missing. A path that cannot be resolved falls back to itself rather than throwing, so a stale
 * entry for a deleted project fails to match instead of costing every other entry its answer.
 */
async function resolvedPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
