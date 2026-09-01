import type { FileReader } from "../../../kernel/ports/file-reader.js";
import { mcpJsonToToml, mergeJsonUserPrime } from "./formats/mcp-format.js";

export class McpCapability {
  readonly consumes: readonly string[];

  constructor(
    readonly params: {
      outputPath: string;
      format: "json" | "toml";
      entrySection?: string;
      mergeStrategy?: "user-prime" | "framework-prime" | "none";
      mergeFn?: (existing: string, incoming: string) => string;
      transformContent?: (content: string) => string;
      resolveOutputPath?: (projectRoot: string, fs: FileReader) => Promise<string>;
      consumes?: readonly string[];
    }
  ) {
    this.consumes = params.consumes ?? [];
  }

  transform(mcpJson: string): string {
    const afterTransform = this.params.transformContent
      ? this.params.transformContent(mcpJson)
      : mcpJson;
    if (this.params.format === "toml") {
      return mcpJsonToToml(afterTransform);
    }
    return afterTransform;
  }

  async resolveOutput(projectRoot: string, fs: FileReader): Promise<string> {
    if (this.params.resolveOutputPath) {
      return this.params.resolveOutputPath(projectRoot, fs);
    }
    return this.params.outputPath;
  }

  merge(existing: string, incoming: string): string {
    if (this.params.mergeFn !== undefined) {
      return this.params.mergeFn(existing, incoming);
    }
    if (this.params.mergeStrategy === "none") {
      return incoming;
    }
    return mergeJsonUserPrime(existing, incoming);
  }

  accepts(relativePath: string): boolean {
    return relativePath === this.params.outputPath;
  }

  equals(other: McpCapability): boolean {
    return (
      this.params.outputPath === other.params.outputPath &&
      this.params.format === other.params.format &&
      this.params.entrySection === other.params.entrySection &&
      this.params.mergeStrategy === other.params.mergeStrategy
    );
  }
}
