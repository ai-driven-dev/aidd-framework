import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description(
      "Remove all AIDD-managed files from the project — retires every part of AIDD; see `framework remove`, which removes the framework only"
    )
    .option("--force", "Confirm file removal (skip dry-run)", false)
    .action(async (cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.cleanUseCase.execute({
          projectRoot,
          force: cmdOptions.force,
          interactive: process.stdout.isTTY,
        });

        if (!result.manifestFound) {
          output.success("Nothing to clean");
          return;
        }

        if (result.dryRun) {
          output.print("The following will be removed:");
          for (const tool of result.preview.tools) {
            output.print(`  ${tool.toolId}: ${tool.fileCount} files`);
          }
          output.print("  manifest: .aidd/");
          const toolCount = result.preview.tools.length;
          if (process.stdout.isTTY) {
            output.print("No files removed.");
          } else {
            output.success(
              `Would remove ${result.preview.totalFileCount} ${result.preview.totalFileCount === 1 ? "file" : "files"} across ${toolCount} ${toolCount === 1 ? "tool" : "tools"}. Use --force to confirm.`
            );
          }
          return;
        }

        output.success(`Cleaned all AIDD files (${result.fileCount} files removed)`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
