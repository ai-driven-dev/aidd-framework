import { compareSemver } from "../../contexts/framework/domain/semver.js";
import type { SelfUpdater } from "./self-updater.js";
import type { VersionReader } from "./version-reader.js";

export interface SelfUpdateInput {
  check: boolean;
  dryRun: boolean;
  force: boolean;
}

export type SelfUpdateResult =
  | { kind: "up-to-date"; version: string }
  | { kind: "check-available"; latestVersion: string; currentVersion: string }
  | { kind: "check-current"; version: string }
  | { kind: "dry-run"; latestVersion: string }
  | { kind: "updated"; latestVersion: string; changelog?: string | null; binaryPath?: string };

export class SelfUpdateUseCase {
  constructor(
    private readonly updater: SelfUpdater,
    private readonly versionProvider: VersionReader
  ) {}

  async execute(input: SelfUpdateInput): Promise<SelfUpdateResult> {
    const currentVersion = this.versionProvider.get();
    const { version: latestVersion, changelog } = await this.updater.fetchLatestRelease();
    const outdated = compareSemver(currentVersion, latestVersion) < 0;

    if (input.check) {
      if (outdated) {
        return { kind: "check-available", latestVersion, currentVersion };
      }
      return { kind: "check-current", version: currentVersion };
    }

    if (!outdated && !input.force) {
      return { kind: "up-to-date", version: currentVersion };
    }

    if (input.dryRun) {
      return { kind: "dry-run", latestVersion };
    }

    const binaryPath = this.updater.install();
    return { kind: "updated", latestVersion, changelog, binaryPath };
  }
}
