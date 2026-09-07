import { CatalogFetchAuthError } from "../../../../kernel/errors.js";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import type { Logger } from "../../../../kernel/ports/logger.js";
import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import type { PluginSource } from "../../../../kernel/source.js";
import type { TokenProvider } from "../../../../runtime/auth/ports/token-provider.js";
import type { LatestReleaseResolver } from "../../../../runtime/self-update/latest-release-resolver.js";
import type { MarketplaceRefresh } from "../../../distribution/application/marketplace-refresh-use-case.js";
import type {
  MarketplaceRegisterFramework,
  MarketplaceRegisterFrameworkOptions,
} from "../../../distribution/application/marketplace-register-framework-use-case.js";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../../distribution/domain/marketplace.js";
import type { MarketplaceSourceMode } from "../../../distribution/domain/marketplace-source-mode.js";
import type { UserSourceReferences } from "../../domain/ports/user-source-references.js";
import type { SetupFlow } from "../../domain/setup-flow.js";
import type { SetupMarketplaceSourceUseCase } from "../setup/setup-marketplace-source-use-case.js";
import {
  frameworkSourceIsShared,
  resolveProjectRootForReferences,
  toleratingUnreadableSourceReferences,
} from "./shared-source-reference-support.js";

/**
 * Resolves a flow's marketplace source and registers it — the one sequence
 * `SetupUseCase` (project scope) and `SetupMachineScopeUseCase` (user scope) both run,
 * in the same order, gated the same way: resolve, guard remote auth, register, refresh.
 * Extracted so that sequence lives once rather than as two copies two use cases would
 * otherwise have to keep in sync by hand.
 */
export class SetupMarketplaceRegistrationUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly setupMarketplaceSourceUseCase: SetupMarketplaceSourceUseCase,
    private readonly marketplaceRegisterFrameworkUseCase: MarketplaceRegisterFramework,
    private readonly marketplaceRefreshUseCase: MarketplaceRefresh,
    private readonly currentVersionProvider: VersionReader,
    private readonly logger: Logger,
    private readonly tokenProvider?: TokenProvider,
    private readonly releaseResolver?: LatestReleaseResolver,
    /** The registry of projects referencing the shared machine-scope source — absent
     * for every caller that predates it, which skips recording a reference rather than
     * guessing one. */
    private readonly userSourceReferences?: UserSourceReferences
  ) {}

  /** Resolves `flow`'s source, when it asks for one at all — a no-op for
   * `--no-default-marketplace`. Called before a caller's own manifest is initialized: a
   * non-interactive run with no `--source` must reject before it ever writes anything. */
  async resolveSourceIfNeeded(flow: SetupFlow): Promise<MarketplaceSourceMode | null> {
    if (!flow.registerDefaultMarketplace) return null;
    return this.setupMarketplaceSourceUseCase.execute({
      projectRoot: flow.projectRoot,
      sourceFromCli: flow.source,
      interactive: flow.interactive,
    });
  }

  /** Guards, registers and refreshes the source `resolveSourceIfNeeded` returned, once
   * the caller's own manifest exists — a no-op when there was no source to register. */
  async registerIfPresent(flow: SetupFlow, source: MarketplaceSourceMode | null): Promise<void> {
    if (source === null) return;
    await this.guardRemoteAuth(source);
    await this.registerMarketplace(flow, source);
    await this.refreshCatalog(flow);
  }

  // Auth is only required to fetch a PRIVATE framework. A token can reach either;
  // without one, allow public repos through and gate only private/unreachable ones.
  private async guardRemoteAuth(source: MarketplaceSourceMode): Promise<void> {
    if (source.kind !== "remote") return;
    if (this.tokenProvider === undefined) return;
    const token = await this.tokenProvider.resolve();
    if (token !== null) return;
    if (
      this.releaseResolver !== undefined &&
      (await this.releaseResolver.isRepoPublic(source.repo))
    ) {
      return;
    }
    throw new CatalogFetchAuthError(`https://github.com/${source.repo}`);
  }

  private async registerMarketplace(flow: SetupFlow, source: MarketplaceSourceMode): Promise<void> {
    const opts = this.buildRegisterOptions(flow, source);
    const result = await this.marketplaceRegisterFrameworkUseCase.execute(opts);
    // `--scope user` has no project-scope manifest for a later `clean` to ever
    // decrement this claim from — see `SetupMachineScopeUseCase`'s own doc comment for
    // why absence, not a recorded reference, is the honest state there.
    if (flow.scope === "user") return;
    // The same name-and-scope predicate `sync` and `clean` apply before touching
    // `references.json` — `MarketplaceRegisterFrameworkUseCase` only ever registers
    // the framework marketplace, so this is always true today, but a future change to
    // that use case must not silently start writing a reference for a registration
    // that is no longer the shared one.
    if (frameworkSourceIsShared(FRAMEWORK_MARKETPLACE_NAME, result.scope)) {
      await this.recordSharedSourceReference(flow.projectRoot);
    }
  }

  // Written every time this runs, not only the first: another project on this machine
  // may have registered the shared source before this one ever did, in which case this
  // project's own reference is still missing until now.
  private async recordSharedSourceReference(projectRoot: string): Promise<void> {
    if (this.userSourceReferences === undefined) return;
    const userSourceReferences = this.userSourceReferences;
    await toleratingUnreadableSourceReferences(this.logger, undefined, async () => {
      const resolvedRoot = await resolveProjectRootForReferences(this.fs, projectRoot);
      await userSourceReferences.addReference(this.currentVersionProvider.get(), resolvedRoot);
    });
  }

  private buildRegisterOptions(
    flow: SetupFlow,
    source: MarketplaceSourceMode
  ): MarketplaceRegisterFrameworkOptions {
    const pluginSource = this.toPluginSource(source);
    return { projectRoot: flow.projectRoot, pluginSource, force: true };
  }

  private toPluginSource(source: MarketplaceSourceMode): PluginSource {
    if (source.kind === "local") return { kind: "local", path: source.path };
    return { kind: "github", repo: source.repo, ref: source.ref };
  }

  private async refreshCatalog(flow: SetupFlow): Promise<void> {
    if (process.env.AIDD_SKIP_MARKETPLACE_REFRESH === "1") return;
    await this.marketplaceRefreshUseCase.execute({ projectRoot: flow.projectRoot });
  }
}
