import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describeError } from "../../../kernel/describe-error.js";
import { resolveHomeDir } from "../../../kernel/reading/home-dir.js";
import type { AiToolId } from "../../../kernel/tool.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../domain/ports/host-plugin-registry-reader.js";

/**
 * One reader per host whose own plugin registry was measured, keyed the way
 * `DiagnoseTelemetryUseCase` already keys its cost readers: a tool absent from the map is
 * a tool nothing here claims to know, and the diagnostic reports it unanswerable rather
 * than assuming it agrees.
 *
 * Measured 2026-09-02 on the machine that built this, reading shape only:
 *
 *   Claude Code  ~/.claude/plugins/installed_plugins.json   { version, plugins: { ref: [ … ] } }
 *   Codex        ~/.codex/config.toml                       [plugins."ref"] enabled = true
 *   Copilot      ~/.copilot/config.json                     JSONC, { …, installedPlugins: [] }
 *
 * **Copilot's registry was measured on 2026-09-03, and it is not the file this once
 * declined to read.** An earlier version refused Copilot because `~/.copilot/config.json` is
 * JSONC and its `installedPlugins` read empty on a machine that had run installs. The
 * instinct was right and the conclusion was wrong: that array is not the registry, and the
 * registry is `~/.copilot/settings.json`. Driven live under a sandboxed home,
 * `copilot plugin marketplace add <dir>` writes `extraKnownMarketplaces` and
 * `copilot plugin install <plugin>@<marketplace>` writes
 * `enabledPlugins: { "<plugin>@<marketplace>": true }` — plain JSON, no comments, and the
 * same key every other host uses. `copilot plugin uninstall` sets that value to `false`
 * rather than deleting the key, so a registered-but-off plugin is an ordinary state here,
 * not a shape only Codex can produce.
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
 * `<plugin>@<marketplace>` ref `enabledPlugins` uses, each key holding one entry per scope
 * the ref was installed at.
 *
 * **Presence is not the whole answer, and an earlier version of this file said it was.**
 * That claim came from reading the first entry of the first key and generalising; read
 * across all 115 entries on the machine measured, they carry a seventh field the first one
 * did not — `projectPath` — on 100 of them, exactly the 99 at `scope: "project"` plus the
 * one at `"local"`. So the registry can say which project wants a ref.
 *
 * **It does not for anything `aidd` itself installed.** A second, later measurement found
 * all six of `aidd`'s own entries at `scope: "user"` — `native-plugin-cli-adapter.ts`'s
 * `enablePlugin` calls no `scopeArgsFor`, that method's own caller is `addMarketplace` and
 * `removeMarketplace` alone, so a plugin enable carries no scope argument and Claude
 * defaults it to `"user"`, machine-wide. `countsForProject` below therefore answers `true`
 * for a ref this machine's *other* project registered, never having asked this one's own
 * `claude` to do anything — a ref counts wherever some entry is user-scoped, which every
 * `aidd`-written one is. That is an honest answer, not a bug: the plugin genuinely is
 * loaded for the `claude` binary this project also runs. What must not be claimed is that
 * project scope discriminates here — only a `projectPath`-carrying entry, which `aidd`
 * never writes, would.
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
      const refs = new Map<string, boolean>();
      const here = await resolvedPath(projectRoot);
      for (const [ref, entries] of Object.entries(plugins)) {
        if (await countsForProject(entries, here)) refs.set(ref, true);
      }
      return { location: this.path, refs };
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
  }
}

/**
 * Codex's own registry, line-scanned rather than parsed — the choice
 * `hook-trust-reader-adapter.ts` already made against this same file, for the reason it
 * states: it *"carries arbitrary nested tables and multi-line values this adapter has no
 * business understanding."* Concretely, the file measured is 26 KB and most of it is
 * `[projects."<absolute path>"]` tables; parsing the whole document to read `[plugins.…]`
 * would pull every project path on the machine into a process that then writes diagnostic
 * output to a terminal.
 *
 * The one shape it needs is the header Codex writes verbatim, `[plugins."<ref>"]`, and the
 * `enabled` key in the table under it. Line-scanning reads that shape wherever it appears,
 * a string value included, which is why the first occurrence of a ref is the one kept. `enabled = false` is carried through as `false` rather
 * than dropped: a host that knows a plugin and declines it is not a host that never heard
 * of it, and the two must not print alike.
 */
class CodexConfigPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  // `projectRoot` is deliberately unused: Codex's plugin tables carry `enabled` and nothing
  // else — no path, no scope — so its registry answers for the machine and cannot answer for
  // one project. Said here rather than left to look like an oversight.
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
 * `<plugin>@<marketplace>` ref as every other host and carrying a boolean.
 *
 * The boolean is the whole of the difference from Claude's file. `copilot plugin uninstall`
 * writes `false` and keeps the key, so a plugin the host knows and declines is a state a
 * person reaches with one ordinary command — measured, not inferred.
 *
 * No project binding: the file records nothing but marketplaces and refs, so like Codex it
 * answers for the machine and cannot answer for one project.
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
      // key on its first install, so a settings file without one belongs to somebody who has
      // installed no plugin — which is "carries none", not "could not be read".
      if (enabled === undefined) return { location: this.path, refs: new Map() };
      return {
        location: this.path,
        refs: new Map(Object.entries(enabled).map(([ref, on]) => [ref, on !== false])),
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
 * Reads each plugin table's body, and only outside multi-line strings.
 *
 * Two defects were found here by running it rather than reading it, and both produced the
 * inversion this whole feature exists to remove: a host that will not load a plugin,
 * reported as one that will.
 *
 * The first took `lines[index + 1]` and called that "absent `enabled` reads as enabled". It
 * meant "not on the immediately following line", so a blank line, a comment, a reordered key
 * or a trailing comment each turned `enabled = false` into an enabled plugin.
 *
 * The second was the fix for the first. Keeping the first occurrence of a ref was justified
 * by "TOML forbids defining a table twice, so a second line that looks like this header is
 * necessarily not one" — which proves one of the two is fake and never which one. A header
 * spelled inside a multi-line string BEFORE the real table therefore won, and a disabled
 * plugin read as registered again, in the mirror image of what last-wins got wrong.
 *
 * Skipping multi-line strings is what makes the ordering rule true rather than asserted: a
 * fake header is not seen at all, so the only header that can be taken is a real one, and
 * TOML's own prohibition then guarantees there is exactly one of those.
 *
 * Absent `enabled` reads as enabled: Codex writes the key on every table it creates, so a
 * table without one is a shape it does not produce, and between "the host listed this
 * plugin" and "the host listed it and said nothing", the listing is the fact.
 */
function scanCodexPluginTables(content: string): ReadonlyMap<string, boolean> {
  const refs = new Map<string, boolean>();
  const lines = outsideMultilineStrings(content.split("\n"));
  for (const [index, line] of lines.entries()) {
    if (line === null) continue;
    const ref = CODEX_PLUGIN_HEADER.exec(line.trim())?.[1];
    if (ref === undefined || refs.has(ref)) continue;
    refs.set(ref, enabledInTableBody(lines, index + 1));
  }
  return refs;
}

/**
 * The same lines, with every one inside a multi-line string replaced by `null`.
 *
 * Positions are preserved rather than filtered out, so a table's body still begins at the
 * line after its header. A delimiter can open and close on one line, so the number of
 * delimiters on a line decides the state after it and an odd count is what flips it; the
 * line carrying the opening delimiter is itself outside, which is right — that line is the
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

/** One installed-plugin entry, narrowed to the two fields that decide whether a ref counts
 * for the project being diagnosed. Everything else Claude records there — install path,
 * version, timestamps, commit sha — describes what was installed, never where it applies. */
interface ClaudeEntry {
  readonly scope?: string;
  readonly projectPath?: string;
}

/** A user-scoped entry applies everywhere and carries no `projectPath`; any other scope
 * applies to the project it names. An entry with neither is not evidence of anything and is
 * ignored rather than counted, which is the same refusal to guess the rest of this file
 * makes. */
async function countsForProject(
  entries: readonly ClaudeEntry[],
  projectRoot: string
): Promise<boolean> {
  if (!Array.isArray(entries)) return false;
  for (const entry of entries) {
    if (entry.scope === "user") return true;
    if (entry.projectPath === undefined) continue;
    if ((await resolvedPath(entry.projectPath)) === projectRoot) return true;
  }
  return false;
}

/**
 * Both sides of the project comparison go through here, and this is not defensive tidying:
 * an end-to-end run caught the string comparison failing on an ordinary macOS temp
 * directory, where `/var` is a symlink to `/private/var`. Claude writes the path it resolved
 * and the CLI holds the path it was invoked from; on any machine where one of them crosses a
 * link, comparing the raw strings reports a registered plugin as missing.
 *
 * A path that cannot be resolved — most often because it no longer exists, which a stale
 * registry entry naturally produces — falls back to itself rather than throwing: an entry
 * for a deleted project should simply not match this one, not cost every other entry its
 * answer.
 */
async function resolvedPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}
