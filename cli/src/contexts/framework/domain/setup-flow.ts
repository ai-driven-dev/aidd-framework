import { InvalidPluginModeConfigError, InvalidSetupToolIdError } from "../../../kernel/errors.js";
import { type ToolId, VALID_TOOL_IDS } from "../../../kernel/tool.js";
import type { MarketplaceSourceMode } from "../../distribution/domain/marketplace-source-mode.js";

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
}
