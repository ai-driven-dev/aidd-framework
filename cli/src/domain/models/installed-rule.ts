import { parseFrontmatter } from "../formats/markdown.js";
import type { AiToolId } from "../models/tool-ids.js";

/**
 * One rule as it sits installed in a project, read back rather than generated.
 *
 * The shape is the one the plugin script this replaced emitted, field for field, so the
 * skill that consumes it did not have to change what it reads. What changed is where the
 * rows come from: the script carried its own table of four tool directories and their
 * extensions, and `RulesCapability.installedLocation()` now answers that per tool, from the
 * installer itself.
 */
export interface InstalledRule {
  readonly tool: AiToolId;
  /** Project-relative, `/`-separated, exactly as the scan found it. */
  readonly path: string;
  /** The file's own name with the installed extension removed — never a frontmatter field.
   * A rule's identity is where it sits: two rules may state the same `name` and still be
   * two rules, and one that states none is still named. */
  readonly name: string;
  /** What the rule says it governs, empty where it says nothing. Empty rather than absent:
   * every tool's rule may carry one, so a missing description is a rule that stated none,
   * not a tool that cannot. */
  readonly description: string;
  /** Every glob the rule scopes itself to, absent when it names none — which means it
   * applies everywhere, a different statement from an empty list. */
  readonly paths?: readonly string[];
}

/** Each tool names the scope field differently: `paths` for Claude Code and Codex, `globs`
 * for Cursor, `applyTo` for Copilot. Read all three and merge, rather than branch on the
 * tool: a file converted from one tool to another carries whichever its source used, and a
 * reader asking one question should not have to know which tool answered. */
const SCOPE_FIELDS = ["paths", "globs", "applyTo"] as const;

/** A scope stated as one string may hold several globs: `tool-paths.md` tells a generator
 * to comma-join them for Cursor and Copilot. Split, so a rule governing two trees reads as
 * two and not as one glob containing a comma. */
function globsIn(value: unknown): readonly string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((glob) => glob.trim())
    .filter((glob) => glob !== "");
}

function scopeOf(frontmatter: Record<string, unknown>): readonly string[] {
  return SCOPE_FIELDS.flatMap((field) => globsIn(frontmatter[field]));
}

/** The installed extension, whole. Trimming at the last dot would leave `.instructions`
 * glued to every Copilot rule's name, since what it installs is `<name>.instructions.md`. */
function nameOf(path: string, extension: string): string {
  const basename = path.split("/").at(-1) ?? path;
  return basename.endsWith(extension) ? basename.slice(0, -extension.length) : basename;
}

export function toInstalledRule(
  tool: AiToolId,
  path: string,
  extension: string,
  content: string
): InstalledRule {
  const { frontmatter } = parseFrontmatter(content);
  const description = frontmatter.description;
  const paths = scopeOf(frontmatter);
  return {
    tool,
    path,
    name: nameOf(path, extension),
    description: typeof description === "string" ? description : "",
    ...(paths.length === 0 ? {} : { paths }),
  };
}
