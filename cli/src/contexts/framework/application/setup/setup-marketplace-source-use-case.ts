import { resolve } from "node:path";
import { InputRequiredError } from "../../../../application/errors.js";
import type { Prompter } from "../../../../domain/ports/prompter.js";
import type { LatestReleaseResolver } from "../../../../runtime/self-update/latest-release-resolver.js";
import { MarketplaceSourceMode } from "../../../distribution/domain/marketplace-source-mode.js";

/** Sentinel select value for "install from main branch tip" — maps to ref undefined. */
const HEAD_CHOICE = "__HEAD__";

export interface SetupMarketplaceSourceOptions {
  projectRoot: string;
  sourceFromCli?: MarketplaceSourceMode;
  interactive: boolean;
}

export class SetupMarketplaceSourceUseCase {
  constructor(
    private readonly prompter: Prompter,
    private readonly releaseResolver: LatestReleaseResolver
  ) {}

  async execute(options: SetupMarketplaceSourceOptions): Promise<MarketplaceSourceMode> {
    if (options.sourceFromCli !== undefined) {
      return this.resolveRef(options.sourceFromCli, options.interactive);
    }
    if (options.interactive) return this.promptSource();
    throw new InputRequiredError(
      "--source remote|local is required in non-interactive mode. Use --source remote or --source local --path /abs/path."
    );
  }

  private async resolveRef(
    source: MarketplaceSourceMode,
    interactive: boolean
  ): Promise<MarketplaceSourceMode> {
    if (source.kind !== "remote") return source;
    if (source.ref !== undefined) return source;
    const rootReleases = await this.releaseResolver.listRootReleases(source.repo);
    if (interactive) return this.promptVersion(source.repo, rootReleases);
    return MarketplaceSourceMode.remote(source.repo, rootReleases[0]);
  }

  private async promptSource(): Promise<MarketplaceSourceMode> {
    const kind = await this.prompter.select<"remote" | "local">("Select framework source:", [
      { name: "remote (fetch from GitHub marketplace — recommended)", value: "remote" },
      { name: "local (copy from local framework directory)", value: "local" },
    ]);
    if (kind === "remote") return this.promptRemoteSource();
    const path = await this.prompter.input("Path to local framework directory:", "");
    return MarketplaceSourceMode.local(resolve(path));
  }

  private async promptRemoteSource(): Promise<MarketplaceSourceMode> {
    const repo = MarketplaceSourceMode.remote().repo;
    const rootReleases = await this.releaseResolver.listRootReleases(repo);
    return this.promptVersion(repo, rootReleases);
  }

  private async promptVersion(
    repo: string,
    rootReleases: readonly string[]
  ): Promise<MarketplaceSourceMode> {
    const choices = [
      ...rootReleases.map((tag, i) => ({
        name: i === 0 ? `${tag} (latest)` : tag,
        value: tag,
      })),
      { name: "HEAD (main branch tip — unreleased)", value: HEAD_CHOICE },
    ];
    const picked = await this.prompter.select<string>(
      "Select framework release to install:",
      choices
    );
    return MarketplaceSourceMode.remote(repo, picked === HEAD_CHOICE ? undefined : picked);
  }
}
