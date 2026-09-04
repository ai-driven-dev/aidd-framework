import type { Command } from "commander";
import { createDeps } from "../../infrastructure/deps.js";
import { printUnrestorable } from "../display/restore-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerRestoreCommand(program: Command): void {
  program
    .command("restore")
    .description("Restore tracked files to their installed version (from manifest hashes)")
    .option("-f, --force", "Restore without prompting", false)
    .action(async (cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const interactive = !cmdOptions.force && process.stdout.isTTY;
        const result = await deps.restoreAllUseCase.execute(
          projectRoot,
          interactive,
          cmdOptions.force
        );

        for (const e of result.errors) output.warn(`[${e.scope}] ${e.message}`);

        // A run that errored restored nothing, and saying "nothing to restore" would
        // report that as the healthy state. Nothing was restored *because* it failed.
        if (result.errors.length > 0) process.exit(1);

        if (
          result.totalRestored === 0 &&
          result.pluginNamesRestored.length === 0 &&
          result.unrestorable.length === 0
        ) {
          output.success("Nothing to restore — all files are unmodified.");
          return;
        }
        if (result.totalRestored > 0) {
          output.success(
            `Restored ${result.totalRestored} file(s), kept ${result.totalKept} file(s)`
          );
        }
        if (result.pluginNamesRestored.length > 0) {
          output.success(`Restored plugins: ${result.pluginNamesRestored.join(", ")}`);
        }
        printUnrestorable(output, result.unrestorable);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
