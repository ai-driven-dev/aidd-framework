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
 * `--scope user`: registers the shared framework source and drives native activation
 * machine-wide, writing nothing under `flow.projectRoot` at all. No tool content
 * install (there is no project tree to install into), no plugin prompt (`SetupFlow`
 * itself refuses `--plugins` at this scope — no manifest entry exists yet to enable one
 * against), and no project-context detection (nothing here reads a project's own files
 * to decide anything).
 *
 * Extracted out of `SetupUseCase` rather than kept as one more private method there: a
 * project-scope run and a machine-scope run share only source resolution and
 * registration (`SetupMarketplaceRegistrationUseCase`), never the rest of their own
 * sequence, so folding both into one constructor was accumulating collaborators neither
 * path used on its own.
 *
 * Records no shared-source reference: `references.json` tracks which *project* still
 * claims the shared source so a later project-scope `clean` knows whether to drop it —
 * a `--scope user` run has no project-scope manifest for a later `clean` to ever read
 * that claim back from, so a reference recorded here could never be decremented by
 * anything. Absence is the honest state until `clean --scope user` (not yet built)
 * purges the shared source unconditionally regardless.
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

  /** Every requested AI tool gets a manifest entry with no files at all — the honest
   * record of "this tool is registered at user scope, nothing installed under any
   * project" — so `MarketplaceSyncSettingsUseCase.selectToolIds` has something to
   * iterate. A tool already present (a second `setup --scope user` run) is left alone
   * rather than reset, the same idempotence project-scope `setup` gives an
   * already-installed tool. */
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
