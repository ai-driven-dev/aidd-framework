import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

interface UpdateCmdOptions {
  check: boolean;
  dryRun: boolean;
  force: boolean;
}

/**
 * A bare verb with no subject means "the CLI itself" — same convention Claude Code and
 * Codex use — which is what retired the old `update` (project-wide tools+plugins+
 * marketplace sweep, formerly `UpdateAllUseCase`): that entry point is gone, its pieces
 * already exist as `framework update`, `plugin update`, and `marketplace refresh`.
 */
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

    switch (result.kind) {
      case "up-to-date":
      case "check-current":
        output.success(`Already up to date (${result.version})`);
        break;
      case "check-available":
        output.info(
          `New version available: ${result.latestVersion} (current: ${result.currentVersion})`
        );
        break;
      case "dry-run":
        output.info(`Would install @ai-driven-dev/cli@${result.latestVersion}`);
        break;
      case "updated": {
        const binaryPart = result.binaryPath ? ` (${result.binaryPath})` : "";
        output.success(`Successfully updated to version ${result.latestVersion}${binaryPart}`);
        if (result.changelog) {
          output.info(`\nChangelog:\n${result.changelog}`);
        }
        break;
      }
    }
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
