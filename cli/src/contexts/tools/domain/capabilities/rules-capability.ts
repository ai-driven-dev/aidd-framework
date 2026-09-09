import { serializeFrontmatter } from "../../../../kernel/markdown.js";
import { AI_TOOL_IDS } from "../../../../kernel/tool.js";

const ALL_TOOL_SUFFIXES: readonly string[] = AI_TOOL_IDS.map((id) => `.${id}.md`);

export class RulesCapability {
  constructor(
    readonly params: {
      directory: string;
      toolSuffix: string;
      inputSuffix?: string;
      buildInstallPath: (fileName: string) => string | null;
      convertFrontmatter: (fm: Record<string, unknown>) => Record<string, unknown>;
    }
  ) {}

  buildOutputPath(ruleName: string): string {
    return `${this.params.directory}rules/${ruleName}${this.params.toolSuffix}`;
  }

  /** A name no rule of a reader's own will ever carry, asked of `buildInstallPath` only so its
   * answer can be read back. Long on purpose: it reaches no output and no disk, and a short one
   * could collide with a real rule name. */
  private static readonly PROBE_STEM = "aidd-installed-location-probe";

  /** Where an installed rule of this tool lives, and what it is called at the end, asked of the
   * installer rather than restated beside it: `buildOutputPath` answers where the framework's
   * own source form goes, while a reader scanning a project needs the *installed* shape, and
   * only `buildInstallPath` — a closure written per tool — knows it. `null` when the tool
   * installs nothing for the name asked about, or answers a path whose stem it rewrote past
   * recognition; neither is a guess. */
  installedLocation(): { readonly directory: string; readonly extension: string } | null {
    const suffix = this.params.inputSuffix ?? this.params.toolSuffix;
    const installed = this.buildInstallPath(`${RulesCapability.PROBE_STEM}${suffix}`);
    if (installed === null) return null;
    const lastSlash = installed.lastIndexOf("/");
    const basename = installed.slice(lastSlash + 1);
    const stemAt = basename.indexOf(RulesCapability.PROBE_STEM);
    if (stemAt === -1) return null;
    return {
      directory: installed.slice(0, lastSlash + 1),
      extension: basename.slice(stemAt + RulesCapability.PROBE_STEM.length),
    };
  }

  buildInstallPath(fileName: string): string | null {
    return this.params.buildInstallPath(fileName);
  }

  convertFrontmatter(fm: Record<string, unknown>): Record<string, unknown> {
    return this.params.convertFrontmatter(fm);
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
