import { CapabilityConfigError } from "../../../../kernel/errors.js";
import type { MergeStrategy } from "../../../../kernel/merge.js";
import type { ToolId } from "../../../../kernel/tool.js";

export class SettingsCapability {
  readonly consumes: readonly string[];
  readonly staticContent: string | undefined;
  readonly staticContentAssetFile: string | undefined;
  readonly requiresTool: ToolId | undefined;

  constructor(
    readonly params: {
      outputPath: string;
      mergeStrategy: MergeStrategy;
      consumes?: readonly string[];
      staticContent?: string;
      staticContentAssetFile?: string;
      requiresTool?: ToolId;
    }
  ) {
    if (params.staticContent !== undefined && params.staticContentAssetFile !== undefined) {
      throw new CapabilityConfigError(
        "SettingsCapability: set either 'staticContent' or 'staticContentAssetFile', not both."
      );
    }
    const hasStaticForm =
      params.staticContent !== undefined || params.staticContentAssetFile !== undefined;
    if (params.consumes?.length && hasStaticForm) {
      throw new CapabilityConfigError(
        "SettingsCapability: set either 'consumes' or 'staticContent', not both."
      );
    }
    if (params.requiresTool !== undefined && !hasStaticForm) {
      throw new CapabilityConfigError(
        "SettingsCapability: 'requiresTool' is only meaningful with 'staticContent'."
      );
    }
    this.consumes = params.consumes ?? [];
    this.staticContent = params.staticContent;
    this.staticContentAssetFile = params.staticContentAssetFile;
    this.requiresTool = params.requiresTool;
  }

  accepts(relativePath: string): boolean {
    return relativePath === this.params.outputPath;
  }

  getMergeStrategy(): MergeStrategy {
    return this.params.mergeStrategy;
  }

  buildOutputPath(): string {
    return this.params.outputPath;
  }

  equals(other: SettingsCapability): boolean {
    return (
      this.params.outputPath === other.params.outputPath &&
      this.params.mergeStrategy === other.params.mergeStrategy
    );
  }
}
