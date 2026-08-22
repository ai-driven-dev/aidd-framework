import { CapabilityConfigError } from "../errors.js";
import { serializeFrontmatter } from "../formats/markdown.js";
import { AI_TOOL_IDS } from "../models/tool-ids.js";

const AGENTS_SKILLS_PREFIX = ".agents/skills/";
const ALL_TOOL_SUFFIXES: readonly string[] = AI_TOOL_IDS.map((id) => `.${id}.md`);

export class SkillsCapability {
  constructor(
    readonly params: {
      directory?: string;
      toolSuffix?: string;
      prefix?: string;
      buildInstallPath: (fileName: string) => string | null;
      convertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
      reverseConvertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
    }
  ) {
    if (!params.prefix && !params.directory) {
      throw new CapabilityConfigError("SkillsCapability requires either prefix or directory");
    }
  }

  buildOutputPath(skillName: string): string {
    if (this.params.prefix !== undefined) {
      return `${AGENTS_SKILLS_PREFIX}${this.params.prefix}${skillName}/SKILL.md`;
    }
    return `${this.params.directory}skills/${skillName}${this.params.toolSuffix ?? ""}`;
  }

  buildInstallPath(fileName: string): string | null {
    return this.params.buildInstallPath(fileName);
  }

  convertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return this.params.convertFrontmatter(fm);
  }

  reverseConvertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return this.params.reverseConvertFrontmatter(fm);
  }

  acceptsFileName(fileName: string): boolean {
    const basename = fileName.split("/").at(-1) ?? fileName;
    const toolSuffix = this.params.toolSuffix ?? "";
    const otherSuffixes = ALL_TOOL_SUFFIXES.filter((s) => s !== toolSuffix);
    return !otherSuffixes.some((s) => basename.endsWith(s));
  }

  serialize(frontmatter: Record<string, unknown>, body: string): string {
    return serializeFrontmatter(frontmatter, body);
  }

  accepts(relativePath: string): boolean {
    if (this.params.prefix !== undefined) {
      return relativePath.startsWith(AGENTS_SKILLS_PREFIX);
    }
    return relativePath.startsWith(this.params.directory ?? "");
  }

  equals(other: SkillsCapability): boolean {
    return (
      this.params.directory === other.params.directory &&
      this.params.toolSuffix === other.params.toolSuffix &&
      this.params.prefix === other.params.prefix
    );
  }
}
