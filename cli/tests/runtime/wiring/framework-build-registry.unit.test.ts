import { describe, expect, it } from "vitest";
import type { FrameworkBuildMode } from "../../../src/contexts/tools/domain/registry.js";
import {
  type FrameworkBuildTarget,
  frameworkBuildTargetModes,
} from "../../../src/contexts/translate/domain/build-target.js";
import { AI_TOOL_IDS } from "../../../src/kernel/tool.js";
import { BundledAssetProviderAdapter } from "../../../src/runtime/assets/asset-loader.js";
import { createFrameworkBuildUseCase } from "../../../src/runtime/wiring/translate.js";
import { CapturingLogger } from "../../helpers/ports/capturing-logger.js";
import { InMemoryFileAdapter } from "../../helpers/ports/in-memory-file-adapter.js";

const ALL_TARGETS: readonly FrameworkBuildTarget[] = AI_TOOL_IDS;
const ALL_MODES: readonly FrameworkBuildMode[] = ["marketplace", "flat"];

function makeDeps() {
  return {
    fs: new InMemoryFileAdapter(),
    assetProvider: new BundledAssetProviderAdapter(),
    logger: new CapturingLogger(),
  };
}

function isSupported(target: FrameworkBuildTarget, mode: FrameworkBuildMode): boolean {
  return frameworkBuildTargetModes().some((e) => e.target === target && e.mode === mode);
}

/**
 * Both the wiring and the domain read the pairs off the profiles, so they cannot
 * disagree about which exist. What is still worth running is the other half: that every
 * pair the domain announces actually resolves to a use case the wiring can construct.
 */
describe("every announced build target/mode resolves to a wired use case", () => {
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
