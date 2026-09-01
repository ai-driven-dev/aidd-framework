import { parseFrontmatter } from "../../../../../kernel/markdown.js";
import { stringifyToml } from "./toml.js";

/**
 * Converts a Claude-format agent markdown file (frontmatter + body) into a
 * Codex subagent TOML string.
 *
 * TOML schema mapping (D-14, D-15, D-16):
 *   name               — when prefixName=false: fm.name when present, else "<pluginName>-<basename>"
 *                        when prefixName=true:  always "<pluginName>-<basename>" (flat mode)
 *   description        — fm.description when present (string)
 *   model              — omitted in MVP1 (D-5): no known Codex model id set
 *   developer_instructions — verbatim body, no rewrite (D-4)
 *
 * Key insertion order is fixed for deterministic output (D-15).
 *
 * prefixName=true is used in flat mode where all plugins share one .codex/agents/ directory;
 * the plugin prefix prevents name collisions between agents from different plugins.
 * prefixName=false is used in marketplace mode where each plugin has its own subdirectory.
 *
 * No inverse: codexAgentMarkdownToToml is lossy — the model field is intentionally
 * omitted (D-5) and the TOML schema diverges from markdown frontmatter, making a
 * lossless round-trip technically impossible.
 */
export function codexAgentMarkdownToToml(
  content: string,
  pluginName: string,
  fileBaseName: string,
  prefixName = false
): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const name = resolveName(frontmatter, pluginName, fileBaseName, prefixName);
  const obj = buildTomlObject(name, frontmatter, body);
  return stringifyToml(obj);
}

function resolveName(
  frontmatter: Record<string, unknown>,
  pluginName: string,
  fileBaseName: string,
  prefixName: boolean
): string {
  const basename = fileBaseName.replace(/\.md$/, "");
  if (!prefixName && typeof frontmatter.name === "string" && frontmatter.name.length > 0) {
    return frontmatter.name;
  }
  return `${pluginName}-${basename}`;
}

function buildTomlObject(
  name: string,
  frontmatter: Record<string, unknown>,
  body: string
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  obj.name = name;
  // description is a required subagent key; default to "" when absent.
  obj.description = typeof frontmatter.description === "string" ? frontmatter.description : "";
  // model is intentionally omitted in MVP1 (D-5): no known Codex model id set.
  obj.developer_instructions = body;
  return obj;
}
