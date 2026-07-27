import type { Command } from "commander";
import { createDeps } from "../../infrastructure/deps.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerSelfUpdateCommand(program: Command): void {
  program
    .command("self-update")
    .description("Update the aidd CLI to the latest version")
    .option("--check", "Check if a newer version is available without installing", false)
    .option("--dry-run", "Preview the update without installing", false)
    .option("-f, --force", "Reinstall even if already up to date", false)
    .action(async (cmdOptions: { check: boolean; dryRun: boolean; force: boolean }) => {
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
    });
}
