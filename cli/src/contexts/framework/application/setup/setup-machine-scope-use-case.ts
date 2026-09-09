import type { VersionReader } from "../../../../kernel/ports/version-reader.js";
import { Manifest } from "../../domain/manifest.js";
import type { ManifestRepository } from "../../domain/ports/manifest-repository.js";
import type { SetupFlow } from "../../domain/setup-flow.js";
import type {
  MarketplaceSyncSettings,
  MarketplaceSyncSettingsResult,
} from "../flows/marketplace-sync-settings-use-case.js";
import type { SetupResult } from "../setup-use-case.js";
import type { SetupMarketplaceRegistrationUseCase } from "../shared/setup-marketplace-registration-use-case.js";
import type { SetupToolsResult } from "./setup-tools-use-case.js";

/**
 * `--scope user`: registers the shared framework source and drives native activation machine-wide,
 * writing nothing under `flow.projectRoot` at all — no tool content install, no plugin prompt, no
 * project-context detection.
 *
 * Records no shared-source reference: `references.json` tracks which *project* still claims the
 * shared source, and a `--scope user` run has no project-scope manifest for a later `clean` to read
 * that claim back from, so one recorded here could never be decremented. Absence is the honest
 * state until `clean --scope user` purges the source unconditionally regardless.
 */
export class SetupMachineScopeUseCase {
  constructor(
    private readonly userManifestRepo: ManifestRepository,
    private readonly setupMarketplaceRegistration: SetupMarketplaceRegistrationUseCase,
    private readonly marketplaceSyncSettingsUseCase: MarketplaceSyncSettings,
    private readonly currentVersionProvider: VersionReader
  ) {}

  async execute(flow: SetupFlow): Promise<SetupResult> {
    const source = await this.setupMarketplaceRegistration.resolveSourceIfNeeded(flow);
    const isNew = await this.initUserManifest();
    await this.setupMarketplaceRegistration.registerIfPresent(flow, source);
    await this.registerUserScopeTools(flow);
    const activation: MarketplaceSyncSettingsResult =
      await this.marketplaceSyncSettingsUseCase.execute({
        projectRoot: flow.projectRoot,
        scope: "user",
        manifestRepo: this.userManifestRepo,
      });
    const install: SetupToolsResult = { results: [] };
    return isNew
      ? { kind: "initialized", install, activation, context: undefined }
      : { kind: "up-to-date", install, activation, context: undefined };
  }

  private async initUserManifest(): Promise<boolean> {
    const existing = await this.userManifestRepo.load();
    if (existing !== null) return false;
    await this.userManifestRepo.save(Manifest.create());
    return true;
  }

  /** Every requested AI tool gets a manifest entry with no files at all — the honest record of
   * "registered at user scope, nothing installed under any project" — so tool selection has
   * something to iterate. A tool already present is left alone rather than reset. */
  private async registerUserScopeTools(flow: SetupFlow): Promise<void> {
    const manifest = await this.userManifestRepo.load();
    if (manifest === null) return;
    const version = this.currentVersionProvider.get();
    let changed = false;
    for (const toolId of flow.aiTools) {
      if (manifest.hasTool(toolId)) continue;
      manifest.addTool(toolId, version, []);
      changed = true;
    }
    if (changed) await this.userManifestRepo.save(manifest);
  }
}
