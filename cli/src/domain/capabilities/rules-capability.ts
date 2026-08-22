import { serializeFrontmatter } from "../formats/markdown.js";
import { AI_TOOL_IDS } from "../models/tool-ids.js";

const ALL_TOOL_SUFFIXES: readonly string[] = AI_TOOL_IDS.map((id) => `.${id}.md`);

export class RulesCapability {
  constructor(
    readonly params: {
      directory: string;
      toolSuffix: string;
      inputSuffix?: string;
      buildInstallPath: (fileName: string) => string | null;
      convertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
      reverseConvertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
    }
  ) {}

  buildOutputPath(ruleName: string): string {
    return `${this.params.directory}rules/${ruleName}${this.params.toolSuffix}`;
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
    const effectiveSuffix = this.params.inputSuffix ?? this.params.toolSuffix;
    const otherSuffixes = ALL_TOOL_SUFFIXES.filter((s) => s !== effectiveSuffix);
    return !otherSuffixes.some((s) => basename.endsWith(s));
  }

  serialize(frontmatter: Record<string, unknown>, body: string): string {
    return serializeFrontmatter(frontmatter, body);
  }

  accepts(relativePath: string): boolean {
    return relativePath.startsWith(this.params.directory);
  }

  equals(other: RulesCapability): boolean {
    return (
      this.params.directory === other.params.directory &&
      this.params.toolSuffix === other.params.toolSuffix
    );
  }
}
