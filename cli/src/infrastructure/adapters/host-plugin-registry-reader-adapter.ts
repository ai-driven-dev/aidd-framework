import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { describeError } from "../../domain/describe-error.js";
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

/**
 * Claude Code's own registry: a JSON document whose `plugins` object is keyed by the same
 * `<plugin>@<marketplace>` ref `enabledPlugins` uses, each key holding one entry per scope
 * the ref was installed at.
 *
 * **Presence is not the whole answer, and an earlier version of this file said it was.**
 * That claim came from reading the first entry of the first key and generalising; read
 * across all 115 entries on the machine measured, they carry a seventh field the first one
 * did not — `projectPath` — on 100 of them, exactly the 99 at `scope: "project"` plus the
 * one at `"local"`. So the registry does say which project wants a ref, and `aidd` writes
 * every one of them at project scope: `claude-cli-adapter.ts`'s own `PROJECT_SCOPE_ARGS`.
 *
 * Ignoring that would report a ref installed for another project as `registered` here, which
 * is the same unmeasured confidence this file refuses to extend to Copilot a few lines up. A
 * ref counts for this project when some entry is user-scoped — machine-wide by construction,
 * and those carry no `projectPath` — or names this project. Claude records no enabled flag
 * anywhere, so a ref that counts maps to `true`.
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

const CODEX_PLUGIN_HEADER = /^\[plugins\."(.+?)"\]\s*(?:#.*)?$/u;
const CODEX_TABLE_HEADER = /^\[/u;
const CODEX_ENABLED_LINE = /^enabled\s*=\s*(true|false)\s*(?:#.*)?$/u;

/**
 * Reads each plugin table's **body**, not the single line after its header.
 *
 * The first version of this took `lines[index + 1]`, and its doc claimed that meant
 * "absent `enabled` reads as enabled". It did not: it meant "not on the immediately
 * following line". Run against six shapes TOML permits, four of them turned
 * `enabled = false` into an enabled plugin — a blank line, a comment line, a reordered key
 * ahead of `enabled`, and a trailing `# comment` on the `enabled` line itself — and a header
 * carrying its own trailing comment dropped the plugin entirely. Every one of those is the
 * exact inversion this feature exists to remove, reached by a file Codex is free to write
 * and a person is free to edit.
 *
 * So: on a header, walk to the next table (`[`), skipping blanks and comments, and take the
 * first `enabled` assignment found. Absent then genuinely means absent, which is what the
 * paragraph below is allowed to claim.
 *
 * Absent reads as enabled: Codex writes the key on every table it creates, so a table
 * without one is a shape it does not produce, and between "the host listed this plugin" and
 * "the host listed it and said nothing", the listing is the fact. Only a literal `false`
 * withholds it.
 */
function scanCodexPluginTables(content: string): ReadonlyMap<string, boolean> {
  const refs = new Map<string, boolean>();
  const lines = content.split("\n");
  for (const [index, line] of lines.entries()) {
    const header = CODEX_PLUGIN_HEADER.exec(line.trim());
    const ref = header?.[1];
    // First occurrence wins. TOML forbids defining a table twice, so a second line that
    // looks like this header is necessarily not one — the likeliest source being a header
    // spelled inside a multi-line string value. Last-write-wins would let that text
    // override the real table's own `enabled`.
    if (ref === undefined || refs.has(ref)) continue;
    refs.set(ref, enabledInTableBody(lines, index + 1));
  }
  return refs;
}

/** The first `enabled` assignment between a table header and the next table, defaulting to
 * enabled when the table declares none. */
function enabledInTableBody(lines: readonly string[], from: number): boolean {
  for (let at = from; at < lines.length; at += 1) {
    const line = (lines[at] ?? "").trim();
    if (CODEX_TABLE_HEADER.test(line)) return true;
    if (line === "" || line.startsWith("#")) continue;
    const enabled = CODEX_ENABLED_LINE.exec(line);
    if (enabled !== null) return enabled[1] === "true";
  }
  return true;
}
