import type { PluginSource } from "../../../kernel/source.js";
import { FRAMEWORK_MARKETPLACE_NAME, Marketplace } from "../domain/marketplace.js";
import type { MarketplaceRegistry } from "../domain/ports/marketplace-registry.js";

export interface MarketplaceRegisterFrameworkOptions {
  projectRoot: string;
  force?: boolean;
  frameworkPath?: string;
  /** Explicit plugin source — when provided, deriveSource() is skipped. */
  pluginSource?: PluginSource;
}

export interface MarketplaceRegisterFrameworkResult {
  registered: boolean;
}

export class MarketplaceRegisterFrameworkUseCase {
  constructor(private readonly registry: MarketplaceRegistry) {}

  async execute(
    options: MarketplaceRegisterFrameworkOptions
  ): Promise<MarketplaceRegisterFrameworkResult> {
    const list = await this.registry.list(options.projectRoot);
    const alreadyRegistered = list.some((m) => m.name === FRAMEWORK_MARKETPLACE_NAME);
    if (alreadyRegistered && !options.force) return { registered: false };
    if (alreadyRegistered && options.force) {
      await this.registry.delete(options.projectRoot, FRAMEWORK_MARKETPLACE_NAME, "project");
    }
    const source = options.pluginSource ?? this.deriveSource(options.frameworkPath);
    const marketplace = Marketplace.create({
      name: FRAMEWORK_MARKETPLACE_NAME,
      source,
      scope: "project",
      addedAt: new Date().toISOString(),
    });
    await this.registry.save(options.projectRoot, marketplace);
    return { registered: true };
  }

  private deriveSource(frameworkPath?: string): PluginSource {
    return { kind: "local", path: frameworkPath ?? "." };
  }
}
