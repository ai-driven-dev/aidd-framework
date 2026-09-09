import { GITKEEP_FILE, InstallationFile } from "../../../../../kernel/file.js";
import { parseFrontmatter } from "../../../../../kernel/markdown.js";
import type { Hasher } from "../../../../../kernel/ports/hasher.js";
import { AI_TOOL_IDS } from "../../../../../kernel/tool.js";
import type { AiTool } from "../../../../tools/domain/contracts.js";
import type { UserFileSection } from "../../../../tools/domain/formats/command.js";
import type { ContentSection } from "../../../../translate/domain/canon.js";

const ALL_TOOL_SUFFIXES: readonly string[] = AI_TOOL_IDS.map((id) => `.${id}.md`);

/**
 * The shape every content-section capability exposes with identical arity, so this engine calls
 * them without per-section branching. Where arity genuinely differs, a `ContentSectionDescriptor`
 * supplies the per-section adapter instead.
 */
export interface ContentSectionCapability {
  buildInstallPath(fileName: string): string | null;
  serialize(frontmatter: Record<string, unknown>, body: string): string;
}

/**
 * Per-section behaviour no uniform signature can express. `key` also drives which capability is
 * read off `toolConfig.capabilities`, keeping K, Cap and the toolConfig type correlated through
 * generics instead of an `as` cast at the call site.
 */
export interface ContentSectionDescriptor<
  K extends UserFileSection,
  Cap extends ContentSectionCapability,
> {
  readonly key: K;
  acceptsFileName(cap: Cap, fileName: string, allToolSuffixes: readonly string[]): boolean;
  convertFrontmatter(
    cap: Cap,
    frontmatter: Record<string, unknown>,
    relativeFileName: string
  ): Record<string, unknown>;
}

export interface InstallContentSectionOptions<
  K extends UserFileSection,
  Cap extends ContentSectionCapability,
> {
  toolConfig: AiTool<Record<K, Cap>>;
  section: ContentSection;
  contentFiles: Map<string, string>;
}

export class InstallContentSectionUseCase<
  K extends UserFileSection,
  Cap extends ContentSectionCapability,
> {
  constructor(
    private readonly hasher: Hasher,
    private readonly descriptor: ContentSectionDescriptor<K, Cap>
  ) {}

  execute(options: InstallContentSectionOptions<K, Cap>): InstallationFile[] {
    const { toolConfig, section, contentFiles } = options;
    const cap = toolConfig.capabilities[this.descriptor.key];
    const results: InstallationFile[] = [];
    for (const [filePath, rawContent] of contentFiles) {
      const file = this.processFile(filePath, rawContent, section, cap, toolConfig);
      if (file !== null) results.push(file);
    }
    return results;
  }

  private processFile(
    filePath: string,
    rawContent: string,
    section: ContentSection,
    cap: Cap,
    toolConfig: AiTool<Record<K, Cap>>
  ): InstallationFile | null {
    if (!filePath.startsWith(`${section.directory}/`)) return null;
    const relativeFileName = filePath.slice(`${section.directory}/`.length);
    if (!this.descriptor.acceptsFileName(cap, relativeFileName, ALL_TOOL_SUFFIXES)) return null;
    if (section.entryFile !== null) {
      const basename = relativeFileName.split("/").at(-1) ?? relativeFileName;
      if (basename !== section.entryFile) return null;
    }
    const outputPath = cap.buildInstallPath(relativeFileName);
    if (outputPath === null) return null;
    if (relativeFileName.endsWith(GITKEEP_FILE)) {
      return new InstallationFile({
        relativePath: outputPath,
        content: "",
        hash: this.hasher.hash(""),
        frameworkPath: filePath,
      });
    }
    return this.buildFile(filePath, outputPath, relativeFileName, rawContent, cap, toolConfig);
  }

  private buildFile(
    filePath: string,
    outputPath: string,
    relativeFileName: string,
    rawContent: string,
    cap: Cap,
    toolConfig: AiTool<Record<K, Cap>>
  ): InstallationFile {
    const rewrittenRaw = toolConfig.rewriteContent(rawContent);
    const { frontmatter, body } = parseFrontmatter(rewrittenRaw);
    const convertedFrontmatter = this.descriptor.convertFrontmatter(
      cap,
      frontmatter,
      relativeFileName
    );
    const outputContent = cap.serialize(convertedFrontmatter, body);
    return new InstallationFile({
      relativePath: outputPath,
      content: outputContent,
      hash: this.hasher.hash(outputContent),
      frameworkPath: filePath,
    });
  }
}
