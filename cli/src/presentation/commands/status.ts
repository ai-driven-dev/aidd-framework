import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printPluginDrift, printScopeReport } from "../display/status-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show drift across all installed tools and plugins")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.statusAllUseCase.execute(projectRoot);

        for (const e of result.errors) output.warn(`[${e.scope}] ${e.message}`);

        const allInSync = result.aiTools.inSync && result.ideTools.inSync;

        if (allInSync && result.errors.length === 0) {
          output.success("All files are in sync");
          return;
        }

        output.print("\nAI tools:");
        printScopeReport(output, result.aiTools);
        output.print("\nIDE tools:");
        printScopeReport(output, result.ideTools);
        output.print("\nPlugins:");
        printPluginDrift(output, { pluginDrift: result.pluginDrift });
        output.print("\nLegend: ~ modified  - deleted  + added");
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
