import { join, relative } from "node:path";
import type { InstalledRule } from "../../domain/models/installed-rule.js";
import { toInstalledRule } from "../../domain/models/installed-rule.js";
import { AI_TOOL_IDS, type AiToolId } from "../../domain/models/tool-ids.js";
import type { FileReader } from "../../domain/ports/file-reader.js";
import { hasRules } from "../../domain/tools/contracts.js";
import { getToolConfig, isAiTool } from "../../domain/tools/registry.js";

export interface ListInstalledRulesInput {
  readonly projectRoot: string;
}

export interface ListInstalledRulesResult {
  readonly rules: readonly InstalledRule[];
}

/** Where this tool's installed rules live, asked of the tool. `undefined` for one that
 * registers no rules capability at all, and for one whose installer answers no path — both
 * mean there is nothing to scan, and neither is a directory guessed here. */
function locationOf(toolId: AiToolId): { directory: string; extension: string } | undefined {
  const tool = getToolConfig(toolId);
  if (!isAiTool(tool) || !hasRules(tool)) return undefined;
  return tool.capabilities.rules.installedLocation() ?? undefined;
}

/** `/`-separated whatever the platform hands back, because the path is data a caller reads
 * and compares, not a path it opens. A Windows checkout answering `.claude\rules\a.md`
 * would make the same project's rules read differently on two machines. */
function projectRelative(projectRoot: string, absolutePath: string): string {
  return relative(projectRoot, absolutePath).replaceAll("\\", "/");
}

/**
 * Every rule installed in a project, across every tool that installs any.
 *
 * Replaces `list-rules.mjs`, which the explore skill shipped and ran directly. That script
 * carried its own table of tool directories and extensions, and its own frontmatter parser;
 * both already existed here, and the table had drifted — it knew four tools and stated that
 * Codex supports no rules, while `plugin-content-translator.ts` installs a plugin's `rules/`
 * into every tool whose capability accepts them. Asking each tool where it installs is what
 * makes a fifth tool, or a moved directory, impossible to miss.
 */
export class ListInstalledRulesUseCase {
  constructor(private readonly files: FileReader) {}

  async execute(input: ListInstalledRulesInput): Promise<ListInstalledRulesResult> {
    const rules: InstalledRule[] = [];
    for (const toolId of AI_TOOL_IDS) {
      const location = locationOf(toolId);
      if (location === undefined) continue;
      rules.push(...(await this.rulesUnder(input.projectRoot, toolId, location)));
    }
    return { rules };
  }

  /** A directory that is not there yields nothing: `listFilesRecursive` answers an empty
   * list for one it cannot read, so a project with a single tool installed is the ordinary
   * case here and not a branch. */
  private async rulesUnder(
    projectRoot: string,
    toolId: AiToolId,
    location: { directory: string; extension: string }
  ): Promise<readonly InstalledRule[]> {
    const absolute = join(projectRoot, location.directory);
    const found = await this.files.listFilesRecursive(absolute);
    const rules: InstalledRule[] = [];
    for (const file of found.filter((path) => path.endsWith(location.extension))) {
      const content = await this.files.readFile(file);
      rules.push(
        toInstalledRule(toolId, projectRelative(projectRoot, file), location.extension, content)
      );
    }
    return rules;
  }
}
