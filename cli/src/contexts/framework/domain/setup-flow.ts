import {
  InvalidPluginModeConfigError,
  InvalidSetupToolIdError,
  UserScopeIdeToolsError,
  UserScopeNoToolsError,
  UserScopePluginModeError,
  UserScopeUnsupportedAiToolsError,
} from "../../../kernel/errors.js";
import type { MarketplaceScope } from "../../../kernel/scope.js";
import { type ToolId, VALID_TOOL_IDS } from "../../../kernel/tool.js";
import type { MarketplaceSourceMode } from "../../distribution/domain/marketplace-source-mode.js";
import { supportsUserScopeActivation } from "../../tools/domain/registry.js";

export type PluginInstallMode = "interactive" | "all" | "recommended" | "named" | "none";

/** Same value domain as `MarketplaceScope`, aliased so this field reads about a setup's own scope
 * rather than about the kernel type it shares. */
export type SetupScope = MarketplaceScope;

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
  /** `"project"` (the default) installs into this project alone. `"user"` registers
   * the shared framework source and native activation machine-wide instead, writing
   * nothing under `projectRoot` — see `architecture.md`'s user-scope section. */
  scope?: SetupScope;
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
  readonly scope: SetupScope;

  constructor(params: SetupFlowParams) {
    this.validateToolIds(params.aiTools ?? [], params.ideTools ?? []);
    this.validatePluginMode(params.pluginMode ?? "none", params.pluginNames ?? []);
    this.validateScope(
      params.scope ?? "project",
      params.aiTools ?? [],
      params.ideTools ?? [],
      params.pluginMode ?? "none"
    );
    this.projectRoot = params.projectRoot;
    this.source = params.source;
    this.aiTools = params.aiTools ?? [];
    this.ideTools = params.ideTools ?? [];
    this.pluginMode = params.pluginMode ?? "none";
    this.pluginNames = params.pluginNames ?? [];
    this.interactive = params.interactive ?? false;
    this.force = params.force ?? false;
    this.registerDefaultMarketplace = params.registerDefaultMarketplace ?? true;
    this.scope = params.scope ?? "project";
  }

  private validateToolIds(aiTools: readonly ToolId[], ideTools: readonly ToolId[]): void {
    const all = [...aiTools, ...ideTools];
    for (const id of all) {
      if (!(VALID_TOOL_IDS as readonly string[]).includes(id)) {
        throw new InvalidSetupToolIdError(id, VALID_TOOL_IDS);
      }
    }
  }

  // `--scope user` writes nothing under `projectRoot`: an IDE tool's project-relative config has
  // nowhere to land, an AI tool with neither native activation nor a user-scope install directory
  // has nowhere to be registered, an empty `--ai` list registers the shared source for no tool at
  // all, and no manifest entry exists yet to enable a plugin against. Each is refused rather than
  // silently dropped.
  private validateScope(
    scope: SetupScope,
    aiTools: readonly ToolId[],
    ideTools: readonly ToolId[],
    pluginMode: PluginInstallMode
  ): void {
    if (scope !== "user") return;
    if (ideTools.length > 0) throw new UserScopeIdeToolsError(ideTools);
    if (aiTools.length === 0) throw new UserScopeNoToolsError();
    const unsupported = aiTools.filter((id) => !supportsUserScopeActivation(id));
    if (unsupported.length > 0) throw new UserScopeUnsupportedAiToolsError(unsupported);
    if (pluginMode !== "none") throw new UserScopePluginModeError();
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
