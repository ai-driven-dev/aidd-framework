import { isAbsolute } from "node:path";
import { InteractiveOnlyError, TrustDeniedError } from "../../../domain/errors.js";
import {
  assertToolSupportsScope,
  type InstallScope,
} from "../../../domain/models/install-scope.js";
import { parsePluginSpec } from "../../../domain/models/plugin.js";
import {
  describePluginSource,
  type PluginSource,
  parsePluginSourceShorthand,
} from "../../../domain/models/plugin-source.js";
import { AI_TOOL_IDS, type AiToolId } from "../../../domain/models/tool-ids.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import type { MarketplaceTrustStore } from "../../../domain/ports/marketplace-trust-store.js";
import type { Prompter } from "../../../domain/ports/prompter.js";
import type { PluginAddUseCase } from "./plugin-add-use-case.js";
import type { PluginInstallFromMarketplaceUseCase } from "./plugin-install-from-marketplace-use-case.js";
import type { PluginPickUseCase } from "./plugin-pick-use-case.js";

export interface PluginInstallOptions {
  pluginArg: string | undefined;
  toolIds: AiToolId[] | "all";
  projectRoot: string;
  interactive: boolean;
  fromMarketplace?: string;
  token?: string;
  yes?: boolean;
  scope?: InstallScope;
}

export interface PluginInstallResult {
  kind: "picked" | "local" | "marketplace";
  installed: readonly string[];
}

export class PluginInstallUseCase {
  constructor(
    private readonly pluginPickUseCase: PluginPickUseCase,
    private readonly pluginAddUseCase: PluginAddUseCase,
    private readonly pluginInstallFromMarketplaceUseCase: PluginInstallFromMarketplaceUseCase,
    private readonly manifestRepo: ManifestRepository,
    private readonly trustStore: MarketplaceTrustStore,
    private readonly prompter: Prompter
  ) {}

  async execute(options: PluginInstallOptions): Promise<PluginInstallResult> {
    if (options.scope !== undefined) await this.validateScope(options.toolIds, options.scope);
    if (options.pluginArg === undefined) return this.executeNoArg(options);
    if (this.isSourceArg(options.pluginArg)) return this.executeLocalSource(options);
    return this.executeMarketplace(options);
  }

  private async validateScope(toolIds: AiToolId[] | "all", scope: InstallScope): Promise<void> {
    const targets = await this.resolveTargetTools(toolIds);
    for (const toolId of targets) assertToolSupportsScope(toolId, scope);
  }

  private async resolveTargetTools(toolIds: AiToolId[] | "all"): Promise<readonly AiToolId[]> {
    if (toolIds !== "all") return toolIds;
    const manifest = await this.manifestRepo.load();
    if (manifest === null) return AI_TOOL_IDS;
    const installed = manifest.getInstalledToolIds();
    return AI_TOOL_IDS.filter((id) => installed.includes(id));
  }

  private isSourceArg(arg: string): boolean {
    // `isAbsolute` also catches a Windows-rooted path (`C:\...`, `\\server\share`), which
    // `startsWith("/")` never does - without it, a local Windows source falls through to
    // the marketplace branch below and is looked up as a package name instead (#707).
    return arg.includes("://") || arg.startsWith("./") || isAbsolute(arg);
  }

  private async executeNoArg(options: PluginInstallOptions): Promise<PluginInstallResult> {
    if (!options.interactive) throw new InteractiveOnlyError("plugin install");
    const result = await this.pluginPickUseCase.execute({
      toolIds: options.toolIds,
      projectRoot: options.projectRoot,
      interactive: true,
    });
    return { kind: "picked", installed: result.installed };
  }

  private async executeLocalSource(options: PluginInstallOptions): Promise<PluginInstallResult> {
    const source = parsePluginSourceShorthand(options.pluginArg as string);
    await this.ensureDirectSourceTrusted(source, options);
    await this.pluginAddUseCase.execute({
      source,
      toolIds: options.toolIds,
      projectRoot: options.projectRoot,
      interactive: options.interactive,
    });
    return { kind: "local", installed: [] };
  }

  private async ensureDirectSourceTrusted(
    source: PluginSource,
    options: PluginInstallOptions
  ): Promise<void> {
    if (await this.trustStore.isTrusted(options.projectRoot, source)) return;
    if (options.yes) {
      await this.trustStore.trust(options.projectRoot, source);
      return;
    }
    const label = describePluginSource(source);
    const confirmed = await this.prompter.confirm(`Trust plugin source '${label}'?`);
    if (!confirmed) throw new TrustDeniedError(label);
    await this.trustStore.trust(options.projectRoot, source);
  }

  private async executeMarketplace(options: PluginInstallOptions): Promise<PluginInstallResult> {
    const { name, version } = parsePluginSpec(options.pluginArg as string);
    if (options.token) process.env.AIDD_TOKEN = options.token;
    const result = await this.pluginInstallFromMarketplaceUseCase.execute({
      pluginName: name,
      version,
      fromMarketplace: options.fromMarketplace,
      toolIds: options.toolIds,
      projectRoot: options.projectRoot,
      interactive: options.interactive,
      autoSelect: options.yes ?? false,
    });
    return { kind: "marketplace", installed: [result.entry.name] };
  }
}
