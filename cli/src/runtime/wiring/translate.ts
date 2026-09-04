import { stat } from "node:fs/promises";
// FRAMEWORK_BUILD_REGISTRY below is built eagerly at module load from `buildContractFor`,
// which reads the tool registry — so this module must register profiles itself rather
// than rely on import order relative to `tools.ts` or `framework.ts`.
import "../../contexts/tools/domain/profiles/claude/profile.js";
import "../../contexts/tools/domain/profiles/codex/profile.js";
import "../../contexts/tools/domain/profiles/copilot/profile.js";
import "../../contexts/tools/domain/profiles/cursor/profile.js";
import "../../contexts/tools/domain/profiles/opencode/profile.js";
import "../../contexts/tools/domain/profiles/vscode/profile.js";
import type { ToolBuildContract } from "../../contexts/tools/domain/build-contract.js";
import type { FileMerger } from "../../contexts/tools/domain/ports/file-merger.js";
import { buildContractFor } from "../../contexts/tools/domain/registry.js";
import { FlatBuildStrategy } from "../../contexts/translate/application/strategies/flat-build-strategy.js";
import { MarketplaceBuildStrategy } from "../../contexts/translate/application/strategies/marketplace-build-strategy.js";
import { FrameworkBuildUseCase } from "../../contexts/translate/application/translate-source.js";
import { frameworkBuildTargetModes } from "../../contexts/translate/domain/build-target.js";
import { AjvSchemaValidatorAdapter } from "../../contexts/translate/infrastructure/schema-validator.js";
import type { AssetProvider } from "../../kernel/ports/asset-provider.js";
import type { FileReader } from "../../kernel/ports/file-reader.js";
import type { FileWriter } from "../../kernel/ports/file-writer.js";
import type { Logger } from "../../kernel/ports/logger.js";

/** The subset of shared deps the framework build pipeline reads — lets EnsureBuilt build any target. */
export interface FrameworkBuildDeps {
  fs: FileReader & FileWriter & FileMerger;
  assetProvider: AssetProvider;
  logger: Logger;
}

export interface FrameworkBuildContext {
  readonly target: string;
  readonly mode: string;
  readonly outDir: string;
  readonly force: boolean;
}

type FrameworkBuildFactory = (
  deps: FrameworkBuildDeps,
  ctx: FrameworkBuildContext
) => FrameworkBuildUseCase;

function buildFrameworkUseCase(
  deps: FrameworkBuildDeps,
  makeStrategy: (
    deps: FrameworkBuildDeps,
    av: AjvSchemaValidatorAdapter
  ) => MarketplaceBuildStrategy | FlatBuildStrategy
): FrameworkBuildUseCase {
  const av = new AjvSchemaValidatorAdapter();
  return new FrameworkBuildUseCase(
    deps.fs,
    av,
    deps.assetProvider,
    deps.logger,
    makeStrategy(deps, av)
  );
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** One registry entry for a tool/mode pair whose profile declares that build contract. */
function frameworkBuildFactoryFor(
  buildContract: () => ToolBuildContract,
  mode: "marketplace" | "flat"
): FrameworkBuildFactory {
  if (mode === "marketplace") {
    return (deps) =>
      buildFrameworkUseCase(
        deps,
        (d, av) => new MarketplaceBuildStrategy(d.fs, av, d.assetProvider, buildContract())
      );
  }
  return (deps, ctx) =>
    buildFrameworkUseCase(
      deps,
      (d, av) =>
        new FlatBuildStrategy(
          d.fs,
          av,
          d.assetProvider,
          buildContract(),
          ctx.force,
          ctx.outDir,
          isDirectory,
          d.logger
        )
    );
}

/**
 * One factory per pair `frameworkBuildTargetModes()` reports, so the wiring cannot
 * offer a target the domain rejects, nor miss one it accepts. Both read the same
 * profiles; a sixth tool whose profile declares `buildContracts` needs no edit here.
 */
function frameworkBuildRegistryEntries(): (readonly [string, FrameworkBuildFactory])[] {
  const entries: (readonly [string, FrameworkBuildFactory])[] = [];
  for (const { target, mode } of frameworkBuildTargetModes()) {
    const buildContract = buildContractFor(target, mode);
    if (buildContract === undefined) continue;
    entries.push([`${target}:${mode}`, frameworkBuildFactoryFor(buildContract, mode)]);
  }
  return entries;
}

const FRAMEWORK_BUILD_REGISTRY: Record<string, FrameworkBuildFactory> = Object.fromEntries(
  frameworkBuildRegistryEntries()
);

export function createFrameworkBuildUseCase(
  deps: FrameworkBuildDeps,
  ctx: FrameworkBuildContext
): FrameworkBuildUseCase | undefined {
  const key = `${ctx.target}:${ctx.mode}`;
  const factory = FRAMEWORK_BUILD_REGISTRY[key];
  return factory?.(deps, ctx);
}
