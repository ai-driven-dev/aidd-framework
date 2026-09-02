import type { MarketplaceSourceMode } from "../../contexts/distribution/domain/marketplace-source-mode.js";
import { InvalidPluginModeConfigError, InvalidSetupToolIdError } from "../../kernel/errors.js";
import { type ToolId, VALID_TOOL_IDS } from "../../kernel/tool.js";

export type PluginInstallMode = "interactive" | "all" | "recommended" | "named" | "none";

export interface SetupFlowParams {
  projectRoot: string;
  source?: MarketplaceSourceMode;
  aiTools?: readonly ToolId[];
  ideTools?: readonly ToolId[];
  pluginMode?: PluginInstallMode;
  pluginNames?: readonly string[];
  interactive?: boolean;
  force?: boolean;
  registerDefaultMarketplace?: boolean;
}

export class SetupFlow {
  readonly projectRoot: string;
  readonly source?: MarketplaceSourceMode;
  readonly aiTools: readonly ToolId[];
  readonly ideTools: readonly ToolId[];
  readonly pluginMode: PluginInstallMode;
  readonly pluginNames: readonly string[];
  readonly interactive: boolean;
  readonly force: boolean;
  readonly registerDefaultMarketplace: boolean;

  constructor(params: SetupFlowParams) {
    this.validateToolIds(params.aiTools ?? [], params.ideTools ?? []);
    this.validatePluginMode(params.pluginMode ?? "none", params.pluginNames ?? []);
    this.projectRoot = params.projectRoot;
    this.source = params.source;
    this.aiTools = params.aiTools ?? [];
    this.ideTools = params.ideTools ?? [];
    this.pluginMode = params.pluginMode ?? "none";
    this.pluginNames = params.pluginNames ?? [];
    this.interactive = params.interactive ?? false;
    this.force = params.force ?? false;
    this.registerDefaultMarketplace = params.registerDefaultMarketplace ?? true;
  }

  private validateToolIds(aiTools: readonly ToolId[], ideTools: readonly ToolId[]): void {
    const all = [...aiTools, ...ideTools];
    for (const id of all) {
      if (!(VALID_TOOL_IDS as readonly string[]).includes(id)) {
        throw new InvalidSetupToolIdError(id, VALID_TOOL_IDS);
      }
    }
  }

  private validatePluginMode(mode: PluginInstallMode, names: readonly string[]): void {
    if (mode === "named" && names.length === 0) {
      throw new InvalidPluginModeConfigError(
        'Plugin mode "named" requires at least one plugin name.'
      );
    }
    if (mode !== "named" && names.length > 0) {
      throw new InvalidPluginModeConfigError(
        `Plugin names provided but mode is "${mode}" (expected "named").`
      );
    }
  }

  isScriptable(): boolean {
    return !this.interactive;
  }

  hasAnyTool(): boolean {
    return this.aiTools.length > 0 || this.ideTools.length > 0;
  }

  equals(other: SetupFlow): boolean {
    return (
      this.projectRoot === other.projectRoot &&
      this.interactive === other.interactive &&
      this.force === other.force &&
      this.pluginMode === other.pluginMode &&
      arraysEqual(this.aiTools, other.aiTools) &&
      arraysEqual(this.ideTools, other.ideTools) &&
      arraysEqual(this.pluginNames, other.pluginNames) &&
      sourcesEqual(this.source, other.source)
    );
  }
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function sourcesEqual(
  a: MarketplaceSourceMode | undefined,
  b: MarketplaceSourceMode | undefined
): boolean {
  if (a === undefined && b === undefined) return true;
  if (a === undefined || b === undefined) return false;
  return a.equals(b);
}
