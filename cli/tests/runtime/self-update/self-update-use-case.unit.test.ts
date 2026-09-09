import { describe, expect, it, vi } from "vitest";
import type { VersionReader } from "../../../src/kernel/ports/version-reader.js";
import { SelfUpdateUseCase } from "../../../src/runtime/self-update/self-update-use-case.js";
import type { SelfUpdater } from "../../../src/runtime/self-update/self-updater.js";

function makeUseCase(
  currentVersion: string,
  latestVersion: string,
  installFn = vi.fn().mockReturnValue("/usr/local/bin/aidd")
): { useCase: SelfUpdateUseCase; installFn: ReturnType<typeof vi.fn> } {
  const versionProvider: VersionReader = { get: vi.fn().mockReturnValue(currentVersion) };
  const updater: SelfUpdater = {
    fetchLatestRelease: vi
      .fn()
      .mockResolvedValue({ version: latestVersion, changelog: "Release notes" }),
    install: installFn,
  };
  return { useCase: new SelfUpdateUseCase(updater, versionProvider), installFn };
}

describe("self-update", () => {
  describe("--check", () => {
    it("reports a newer version is available when running --check", async () => {
      const { useCase } = makeUseCase("2.5.0", "2.6.0");
      const result = await useCase.execute({ check: true, dryRun: false, force: false });
      expect(result).toEqual({
        kind: "check-available",
        latestVersion: "2.6.0",
        currentVersion: "2.5.0",
      });
    });

    it("reports already on latest when running --check with matching version", async () => {
      const { useCase } = makeUseCase("2.5.0", "2.5.0");
      const result = await useCase.execute({ check: true, dryRun: false, force: false });
      expect(result).toEqual({ kind: "check-current", version: "2.5.0" });
    });

    it("does not install", async () => {
      const { useCase, installFn } = makeUseCase("2.5.0", "2.6.0");
      await useCase.execute({ check: true, dryRun: false, force: false });
      expect(installFn).not.toHaveBeenCalled();
    });
  });

  describe("no flags", () => {
    it("skips install and reports up-to-date when already on latest version", async () => {
      const { useCase, installFn } = makeUseCase("2.5.0", "2.5.0");
      const result = await useCase.execute({ check: false, dryRun: false, force: false });
      expect(result).toEqual({ kind: "up-to-date", version: "2.5.0" });
      expect(installFn).not.toHaveBeenCalled();
    });

    it("installs and returns updated when outdated", async () => {
      const { useCase, installFn } = makeUseCase("2.5.0", "2.6.0");
      const result = await useCase.execute({ check: false, dryRun: false, force: false });
      expect(result).toEqual({
        kind: "updated",
        latestVersion: "2.6.0",
        changelog: "Release notes",
        binaryPath: "/usr/local/bin/aidd",
      });
      expect(installFn).toHaveBeenCalledOnce();
    });
  });

  describe("--dry-run", () => {
    it("previews the latest version without installing when --dry-run is set", async () => {
      const { useCase, installFn } = makeUseCase("2.5.0", "2.6.0");
      const result = await useCase.execute({ check: false, dryRun: true, force: false });
      expect(result).toEqual({ kind: "dry-run", latestVersion: "2.6.0" });
      expect(installFn).not.toHaveBeenCalled();
    });
  });

  describe("--force", () => {
    it("reinstalls even when already on latest", async () => {
      const { useCase, installFn } = makeUseCase("2.5.0", "2.5.0");
      const result = await useCase.execute({ check: false, dryRun: false, force: true });
      expect(result).toEqual({
        kind: "updated",
        latestVersion: "2.5.0",
        changelog: "Release notes",
        binaryPath: "/usr/local/bin/aidd",
      });
      expect(installFn).toHaveBeenCalledOnce();
    });
  });
});
