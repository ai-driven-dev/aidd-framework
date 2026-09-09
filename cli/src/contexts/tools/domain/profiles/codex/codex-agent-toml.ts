import { parseFrontmatter } from "../../../../../kernel/markdown.js";
import { stringifyToml } from "./toml.js";

/**
 * Converts a Claude-format agent markdown file (frontmatter + body) into a Codex subagent TOML
 * string. Key insertion order is fixed for deterministic output, and the conversion is lossy —
 * no model field is emitted and the TOML schema diverges from the frontmatter, so there is no
 * inverse.
 *
 * `prefixName` is for flat mode, where every plugin shares one `.codex/agents/` directory and
 * the plugin prefix is what keeps two plugins' agents from colliding.
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
  // model is intentionally omitted: no known Codex model id set.
  obj.developer_instructions = body;
  return obj;
}
