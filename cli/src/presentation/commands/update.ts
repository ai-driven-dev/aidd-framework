import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Re-install runtime configs, update plugins, and refresh marketplaces")
    .option("-f, --force", "Overwrite modified files without prompting", false)
    .action(async (cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.updateAllUseCase.execute({
          projectRoot,
          userForce: cmdOptions.force,
          interactive: process.stdout.isTTY ?? false,
        });

        for (const t of result.updatedTools) {
          output.success(`Updated ${t.toolId} (${t.fileCount} files)`);
        }
        if (result.updatedTools.length === 0) {
          output.info("All tools up to date.");
        }
        if (result.updatedPlugins.length > 0) {
          output.success(`Updated plugins: ${result.updatedPlugins.join(", ")}`);
        }
        if (result.marketplaceRefreshFailed) {
          output.warn("One or more marketplace refreshes failed.");
        }
        for (const e of result.errors) {
          output.warn(`[${e.scope}] ${e.message}`);
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
