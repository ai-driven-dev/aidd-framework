import { resolve } from "node:path";
import type { Command } from "commander";
import type {
  FrameworkBuildMode,
  FrameworkBuildTarget,
} from "../../domain/models/framework-build.js";
import { createDeps, createFrameworkBuildUseCase } from "../../infrastructure/deps.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

const SUPPORTED_TARGETS: readonly string[] = ["claude", "cursor", "copilot", "codex", "opencode"];

export function registerFrameworkCommand(program: Command): void {
  const framework = program
    .command("framework")
    .description("Framework build and management tools");

  framework
    .command("build")
    .description(
      "Build a Claude-format framework into a target-native plugin marketplace tree or project workspace"
    )
    .requiredOption("--source <path>", "Path to the source framework directory")
    .requiredOption("--target <target>", "Build target (claude, cursor, copilot, codex, opencode)")
    .requiredOption("--out <dir>", "Output directory (marketplace dist or project root)")
    .option("--flat", "Materialize directly into project workspace, bypass marketplace")
    .option("--force", "Overwrite existing files at canonical paths (flat mode only)")
    .action(
      async (cmdOptions: {
        source: string;
        target: string;
        out: string;
        flat?: boolean;
        force?: boolean;
      }) => {
        const { verbose, output, projectRoot } = parseGlobalOptions(program);
        const errorHandler = new ErrorHandler(output);

        if (!SUPPORTED_TARGETS.includes(cmdOptions.target)) {
          output.error(
            `Unsupported target '${cmdOptions.target}'. Supported targets: ${SUPPORTED_TARGETS.join(", ")}.`
          );
          process.exit(1);
        }
        if (cmdOptions.force && !cmdOptions.flat) {
          output.error("--force requires --flat.");
          process.exit(1);
        }
        const sourceDir = resolve(projectRoot, cmdOptions.source);
        const outDir = resolve(projectRoot, cmdOptions.out);
        const target = cmdOptions.target as FrameworkBuildTarget;
        const mode: FrameworkBuildMode = cmdOptions.flat ? "flat" : "marketplace";
        const force = cmdOptions.force ?? false;

        try {
          const deps = await createDeps(projectRoot, { verbose }, output);
          const useCase = createFrameworkBuildUseCase(deps, { target, mode, outDir, force });
          if (useCase === undefined) {
            output.error(
              `Unsupported target/mode combination: --target ${target}${cmdOptions.flat ? " --flat" : ""}.`
            );
            process.exit(1);
          }
          const result = await useCase.execute({ sourceDir, outDir, target, mode, force });
          if (mode === "flat") {
            output.success(
              `Flat-installed ${result.plugins.length} plugins, ${result.totalFiles} files written under ${result.outDir}`
            );
          } else {
            output.success(
              `Built ${result.plugins.length} plugins, ${result.totalFiles} files written to ${result.outDir}`
            );
          }
        } catch (error) {
          errorHandler.handle(error);
        }
      }
    );
}
