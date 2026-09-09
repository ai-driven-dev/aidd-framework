import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printSelfUpdateResult } from "../display/update-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

interface UpdateCmdOptions {
  check: boolean;
  dryRun: boolean;
  force: boolean;
}

/** A bare verb with no subject means the CLI itself, the convention Claude Code and Codex
 * share. The project-wide sweep lives at `framework update`, `plugin update` and
 * `marketplace refresh`. */
async function runUpdateAction(program: Command, cmdOptions: UpdateCmdOptions): Promise<void> {
  const { verbose, output, projectRoot } = parseGlobalOptions(program);
  const errorHandler = new ErrorHandler(output);

  try {
    const deps = await createDeps(projectRoot, { verbose }, output);

    const result = await deps.selfUpdateUseCase.execute({
      check: cmdOptions.check,
      dryRun: cmdOptions.dryRun,
      force: cmdOptions.force,
    });

    printSelfUpdateResult(output, result);
  } catch (error) {
    errorHandler.handle(error);
  }
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .alias("upgrade")
    .description("Update the aidd CLI itself to the latest version")
    .option("--check", "Check if a newer version is available without installing", false)
    .option("--dry-run", "Preview the update without installing", false)
    .option("-f, --force", "Reinstall even if already up to date", false)
    .action(async (cmdOptions: UpdateCmdOptions) => {
      await runUpdateAction(program, cmdOptions);
    });
}
