import type { MarketplaceScope } from "../../../kernel/scope.js";
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
  /** The scope this registration actually lives at once `execute` returns — always `"user"`
   * today, since a pre-existing project-scope entry is migrated unconditionally. Carried back
   * rather than hardcoded again by a caller that needs to know. */
  scope: MarketplaceScope;
}

/** Registering the bundled framework marketplace, as its callers need it. */
export interface MarketplaceRegisterFramework {
  execute(
    options: MarketplaceRegisterFrameworkOptions
  ): Promise<MarketplaceRegisterFrameworkResult>;
}

export class MarketplaceRegisterFrameworkUseCase implements MarketplaceRegisterFramework {
  constructor(private readonly registry: MarketplaceRegistry) {}

  async execute(
    options: MarketplaceRegisterFrameworkOptions
  ): Promise<MarketplaceRegisterFrameworkResult> {
    const list = await this.registry.list(options.projectRoot);
    const found = list.find((m) => m.name === FRAMEWORK_MARKETPLACE_NAME);
    if (found?.scope === "project") {
      // A project-scope entry from before the machine-scope move is retired unconditionally,
      // `--force` or not: this is the migration itself completing, never an option a caller
      // opts out of. `list()` puts a project entry first and filters a same-named user one out,
      // so leaving this one in place would make the user-scope entry written below invisible to
      // every future `list()` call.
      await this.registry.delete(options.projectRoot, FRAMEWORK_MARKETPLACE_NAME, "project");
    } else if (found !== undefined) {
      // Already migrated (scope "user"): idempotent unless a caller asks to rewrite it.
      if (!options.force) return { registered: false, scope: found.scope };
      await this.registry.delete(options.projectRoot, FRAMEWORK_MARKETPLACE_NAME, "user");
    }
    const source = options.pluginSource ?? this.deriveSource(options.frameworkPath);
    // Machine scope, not project: every project on this machine registers the same framework
    // marketplace, so a second project must find the first project's entry rather than write
    // its own — codex and copilot refuse a second source under the same name outright, and
    // claude would otherwise silently repoint the whole machine at whichever project last ran
    // `setup`.
    const marketplace = Marketplace.create({
      name: FRAMEWORK_MARKETPLACE_NAME,
      source,
      scope: "user",
      addedAt: new Date().toISOString(),
    });
    await this.registry.save(options.projectRoot, marketplace);
    return { registered: true, scope: marketplace.scope };
  }

  private deriveSource(frameworkPath?: string): PluginSource {
    return { kind: "local", path: frameworkPath ?? "." };
  }
}
