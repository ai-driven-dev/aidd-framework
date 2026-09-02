import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printPluginIssues, printScopeIssues } from "../display/doctor-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check installation health and detect issues across all tools and plugins")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.doctorAllUseCase.execute(projectRoot);

        for (const e of result.errors) output.warn(`[${e.scope}] ${e.message}`);

        if (result.healthy) {
          output.success("Installation is healthy");
          return;
        }

        printScopeIssues(output, "AI", result.ai);
        printScopeIssues(output, "IDE", result.ide);
        printPluginIssues(output, result.pluginIssues);
        process.exit(1);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
