import { resolve } from "node:path";
import type { Command } from "commander";
import type { FrameworkBuildMode } from "../../contexts/tools/domain/registry.js";
import {
  type FrameworkBuildTarget,
  supportedBuildTargets,
} from "../../contexts/translate/domain/build-target.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import { createFrameworkBuildUseCase } from "../../runtime/wiring/translate.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions } from "./global-options.js";

interface TranslateExecutionParams {
  projectRoot: string;
  verbose: boolean;
  output: CLIOutput;
  sourceDir: string;
  outDir: string;
  target: FrameworkBuildTarget;
  mode: FrameworkBuildMode;
  force: boolean;
}

/** The build+report core, once `--to`/`--as`/`--out` flags are validated and resolved. */
async function runTranslateCore(params: TranslateExecutionParams): Promise<void> {
  const errorHandler = new ErrorHandler(params.output);
  try {
    const deps = await createDeps(params.projectRoot, { verbose: params.verbose }, params.output);
    const useCase = createFrameworkBuildUseCase(deps, {
      target: params.target,
      mode: params.mode,
      outDir: params.outDir,
      force: params.force,
    });
    if (useCase === undefined) {
      params.output.error(
        `Unsupported target/mode combination: ${params.target} (${params.mode}).`
      );
      process.exit(1);
    }
    const result = await useCase.execute({
      sourceDir: params.sourceDir,
      outDir: params.outDir,
      target: params.target,
      mode: params.mode,
    });
    if (params.mode === "flat") {
      params.output.success(
        `Flat-installed ${result.plugins.length} plugins, ${result.totalFiles} files written under ${result.outDir}`
      );
    } else {
      params.output.success(
        `Built ${result.plugins.length} plugins, ${result.totalFiles} files written to ${result.outDir}`
      );
    }
  } catch (error) {
    errorHandler.handle(error);
  }
}

interface TranslateCmdOptions {
  to: string;
  out: string;
  as?: string;
  force?: boolean;
}

export function registerTranslateCommand(program: Command): void {
  program
    .command("translate")
    .description(
      "Convert an arbitrary source into a target-native plugin tree — records nothing (see `sync` for the manifest-driven, tracked version)"
    )
    .argument("<source>", "Path to the source framework directory")
    .requiredOption("--to <target>", "Conversion target (claude, cursor, copilot, codex, opencode)")
    .requiredOption("--out <dir>", "Output directory (marketplace dist or project root)")
    .option("--as <marketplace|flat>", "Output layout", "marketplace")
    .option("--force", "Overwrite existing files at canonical paths under --out")
    .action(async (source: string, cmdOptions: TranslateCmdOptions) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);

      const targets = supportedBuildTargets();
      if (!(targets as readonly string[]).includes(cmdOptions.to)) {
        output.error(
          `Unsupported target '${cmdOptions.to}'. Supported targets: ${targets.join(", ")}.`
        );
        process.exit(1);
      }
      if (
        cmdOptions.as !== undefined &&
        cmdOptions.as !== "marketplace" &&
        cmdOptions.as !== "flat"
      ) {
        output.error(`Invalid --as '${cmdOptions.as}'. Expected 'marketplace' or 'flat'.`);
        process.exit(1);
      }
      const mode: FrameworkBuildMode = cmdOptions.as === "flat" ? "flat" : "marketplace";

      await runTranslateCore({
        projectRoot,
        verbose,
        output,
        sourceDir: resolve(projectRoot, source),
        outDir: resolve(projectRoot, cmdOptions.out),
        target: cmdOptions.to as FrameworkBuildTarget,
        mode,
        force: cmdOptions.force ?? false,
      });
    });
}
