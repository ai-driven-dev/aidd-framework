import { parseFrontmatter, serializeFrontmatter } from "../../../../kernel/markdown.js";

function agentNameFromFrontmatter(
  fm: Record<string, unknown>,
  fileName?: string
): string | undefined {
  const base = fileName?.split("/").at(-1);
  const name = fm.name ?? base?.replace(/\.md$/, "");
  return typeof name === "string" ? name : undefined;
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function buildTomlContent(frontmatter: Record<string, unknown>, body: string): string {
  const lines: string[] = [
    `name = ${tomlString(String(frontmatter.name ?? ""))}`,
    `description = ${tomlString(String(frontmatter.description ?? ""))}`,
  ];
  if (frontmatter.model !== undefined) {
    lines.push(`model = ${tomlString(String(frontmatter.model))}`);
  }
  lines.push(`developer_instructions = """\n${body}\n"""`);
  return `${lines.join("\n")}\n`;
}

function stripSuffix(toolSuffix: string, fileName: string): string {
  const basename = fileName.split("/").at(-1) ?? fileName;
  const dir = fileName.slice(0, fileName.length - basename.length);
  if (basename.endsWith(toolSuffix)) {
    return `${dir}${basename.slice(0, -toolSuffix.length)}.md`;
  }
  return fileName;
}

function toTomlBasename(toolSuffix: string, fileName: string): string {
  const basename = fileName.split("/").at(-1) ?? fileName;
  if (basename.endsWith(toolSuffix)) {
    return `${basename.slice(0, -toolSuffix.length)}.toml`;
  }
  if (basename.endsWith(".md")) {
    return `${basename.slice(0, -3)}.toml`;
  }
  return `${basename}.toml`;
}

export class AgentsCapability {
  constructor(
    readonly params: {
      directory: string;
      toolSuffix: string;
      format: "markdown" | "toml";
      userFileExt?: string;
      buildInstallPath?: (fileName: string) => string | null;
      convertFrontmatter?: (
        fm: Record<string, unknown>,
        fileName?: string
      ) => Record<string, unknown>;
    }
  ) {}

  buildOutputPath(agentName: string): string {
    return `${this.params.directory}agents/${agentName}${this.params.toolSuffix}`;
  }

  buildUserFilePath(userFileName: string): string {
    const basename = userFileName.split("/").at(-1) ?? userFileName;
    const { userFileExt } = this.params;
    if (userFileExt !== undefined) {
      const name = basename.endsWith(".md") ? basename.slice(0, -3) : basename;
      return `${this.params.directory}agents/${name}${userFileExt}`;
    }
    return `${this.params.directory}agents/${basename}`;
  }

  buildInstallPath(relativeFileName: string): string | null {
    if (this.params.buildInstallPath) return this.params.buildInstallPath(relativeFileName);
    const basename = relativeFileName.split("/").at(-1) ?? relativeFileName;
    if (this.params.format === "toml") {
      return `${this.params.directory}agents/${toTomlBasename(this.params.toolSuffix, basename)}`;
    }
    return stripSuffix(this.params.toolSuffix, `${this.params.directory}agents/${basename}`);
  }

  accepts(relativePath: string): boolean {
    return relativePath.startsWith(this.params.directory);
  }

  acceptsFileName(fileName: string, allToolSuffixes: readonly string[]): boolean {
    const basename = fileName.split("/").at(-1) ?? fileName;
    const otherSuffixes = allToolSuffixes.filter((s) => s !== this.params.toolSuffix);
    return !otherSuffixes.some((s) => basename.endsWith(s));
  }

  convertFrontmatter(fm: Record<string, unknown>, fileName?: string): Record<string, unknown> {
    if (this.params.convertFrontmatter) return this.params.convertFrontmatter(fm, fileName);
    const name = agentNameFromFrontmatter(fm, fileName);
    if (this.params.format === "toml") {
      const result: Record<string, unknown> = { name, description: fm.description };
      if (fm.model !== undefined) result.model = fm.model;
      return result;
    }
    return { name, description: fm.description };
  }

  serialize(frontmatter: Record<string, unknown>, body: string): string {
    if (this.params.format === "toml") {
      return buildTomlContent(frontmatter, body);
    }
    return serializeFrontmatter(frontmatter, body);
  }

  deserialize(content: string): { frontmatter: Record<string, unknown>; body: string } {
    return parseFrontmatter(content);
  }

  equals(other: AgentsCapability): boolean {
    return (
      this.params.directory === other.params.directory &&
      this.params.toolSuffix === other.params.toolSuffix &&
      this.params.format === other.params.format &&
      this.params.userFileExt === other.params.userFileExt
    );
  }
}
