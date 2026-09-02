import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AiToolId } from "../../domain/models/tool-ids.js";
import type {
  HostPluginRegistryReader,
  HostPluginRegistryReading,
} from "../../domain/ports/host-plugin-registry-reader.js";
import { resolveHomeDir } from "../home-dir.js";

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
 * **Copilot has no reader here, deliberately.** Its file is JSONC — it opens with two `//`
 * comment lines, so `JSON.parse` throws on it outright — and its `installedPlugins` read
 * empty on a machine that had run installs. One of those two facts alone would be a reason
 * to be careful; together they mean nobody has established that this array is the registry
 * a Copilot install writes to. Writing a reader against it would produce a confident
 * "not registered" from a file nobody has shown answers the question, which is the exact
 * defect this whole feature exists to remove. Copilot reads unanswerable until somebody
 * measures what its install actually writes.
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
  ]);
}

/** `error.code || error.message`, the rule `hook-trust-reader-adapter.ts` reads by and for
 * its reason: a filesystem failure's `code` (`ENOENT`, `EACCES`) is the concise half, while
 * `.message` restates the path the sentence around it already names. A parse failure has no
 * `code` worth preferring, so it falls through to the message, which is where the useful
 * half of a `SyntaxError` lives. */
function describeError(error: unknown): string {
  const shaped = error as { code?: string; message?: string };
  return shaped.code ?? shaped.message ?? String(error);
}

/**
 * Claude Code's own registry: a JSON document whose `plugins` object is keyed by the same
 * `<plugin>@<marketplace>` ref `enabledPlugins` uses. Presence is the whole answer — the
 * entries beneath a key record scope, install path and version, none of which decides
 * whether the plugin loads, and Claude records no enabled flag at all. So every ref it
 * carries maps to `true`.
 */
class ClaudeInstalledPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  async read(): Promise<HostPluginRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    try {
      const parsed = JSON.parse(content) as { plugins?: Record<string, unknown> };
      const plugins = parsed.plugins;
      if (plugins === undefined || typeof plugins !== "object") {
        return { location: this.path, unreadable: "no `plugins` object" };
      }
      return { location: this.path, refs: new Map(Object.keys(plugins).map((ref) => [ref, true])) };
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
 * `enabled` line that follows it. `enabled = false` is carried through as `false` rather
 * than dropped: a host that knows a plugin and declines it is not a host that never heard
 * of it, and the two must not print alike.
 */
class CodexConfigPluginsReader implements HostPluginRegistryReader {
  constructor(private readonly path: string) {}

  async read(): Promise<HostPluginRegistryReading> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      return { location: this.path, unreadable: describeError(error) };
    }
    return { location: this.path, refs: scanCodexPluginTables(content) };
  }
}

const CODEX_PLUGIN_HEADER = /^\[plugins\."(.+)"\]$/u;
const CODEX_ENABLED_LINE = /^enabled\s*=\s*(true|false)$/u;

/** Absent `enabled` reads as enabled: Codex writes the key on every table it creates (27 of
 * 27 on the machine measured), so a table without one is a shape nobody has produced —
 * and between "the host listed this plugin" and "the host listed it and said nothing", the
 * listing is the fact. Only a literal `false` withholds it. */
function scanCodexPluginTables(content: string): ReadonlyMap<string, boolean> {
  const refs = new Map<string, boolean>();
  const lines = content.split("\n");
  for (const [index, line] of lines.entries()) {
    const header = CODEX_PLUGIN_HEADER.exec(line.trim());
    if (header === null) continue;
    const ref = header[1];
    if (ref === undefined) continue;
    const enabled = CODEX_ENABLED_LINE.exec((lines[index + 1] ?? "").trim());
    refs.set(ref, enabled === null ? true : enabled[1] === "true");
  }
  return refs;
}
