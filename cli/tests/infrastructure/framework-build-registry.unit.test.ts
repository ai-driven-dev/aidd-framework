import { describe, expect, it } from "vitest";
import {
  FRAMEWORK_BUILD_TARGET_MODES,
  type FrameworkBuildMode,
  type FrameworkBuildTarget,
} from "../../src/domain/models/framework-build.js";
import { BundledAssetProviderAdapter } from "../../src/infrastructure/assets/asset-loader.js";
import { createFrameworkBuildUseCase } from "../../src/infrastructure/deps.js";
import { CapturingLogger } from "../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../helpers/ports/in-memory-file-adapter.js";

const ALL_TARGETS: readonly FrameworkBuildTarget[] = [
  "claude",
  "cursor",
  "copilot",
  "codex",
  "opencode",
];
const ALL_MODES: readonly FrameworkBuildMode[] = ["marketplace", "flat"];

function makeDeps() {
  return {
    fs: new InMemoryFileAdapter(),
    assetProvider: new BundledAssetProviderAdapter(),
    logger: new CapturingLogger(),
  };
}

function isSupported(target: FrameworkBuildTarget, mode: FrameworkBuildMode): boolean {
  return FRAMEWORK_BUILD_TARGET_MODES.some((e) => e.target === target && e.mode === mode);
}

describe("deps.ts's build registry matches domain's FRAMEWORK_BUILD_TARGET_MODES exactly", () => {
  for (const target of ALL_TARGETS) {
    for (const mode of ALL_MODES) {
      const label = `${target}:${mode}`;
      const expected = isSupported(target, mode);

      it(`${label} is ${expected ? "" : "NOT "}wired in the registry, matching the domain list`, () => {
        const useCase = createFrameworkBuildUseCase(makeDeps(), {
          target,
          mode,
          outDir: "/out",
          force: false,
        });
        expect(useCase !== undefined).toBe(expected);
      });
    }
  }
});
