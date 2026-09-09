import type { Command } from "commander";
import { parseInstallScope } from "../../contexts/framework/domain/install-scope.js";
import { assertValidAiToolId, parseToolOption } from "../../kernel/tool.js";
import { createDeps, createMenuDeps } from "../../runtime/wiring/framework.js";
import {
  printInstalledPlugins,
  printPluginInstallOutcome,
  printPluginRemoved,
  printPluginSearchHits,
  printPluginsUpdated,
} from "../display/plugin-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./spawn-cli-command.js";
import { syncNativeActivation } from "./sync-native-activation.js";

export function registerPluginCommand(program: Command): void {
  const plugin = program.command("plugin").description("Manage plugins for AI tools");

  plugin.action(async () => {
    if (!process.stdout.isTTY) {
      plugin.help();
      return;
    }
    const { prompter } = createMenuDeps(process.cwd());
    const choice = await prompter.select("plugin: what do you want to do?", [
      { name: "Install plugin", value: "install" },
      { name: "List installed plugins", value: "list" },
      { name: "Search plugins", value: "search", description: "requires query arg" },
      { name: "Update plugins", value: "update" },
      { name: "Remove a plugin", value: "remove", description: "requires name arg" },
    ]);
    await spawnCliCommand(["plugin", choice]);
  });

  plugin
    .command("remove <name>")
    .description("Remove a plugin from one or all AI tools")
    .option("--tool <toolId>", "Target AI tool (default: all installed)")
    .action(async (name: string, cmdOptions: { tool?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertValidAiToolId(cmdOptions.tool);
        const deps = await createDeps(projectRoot, { verbose }, output);
        await deps.pluginRemoveUseCase.execute({
          pluginName: name,
          toolIds: parseToolOption(cmdOptions.tool),
          projectRoot,
        });
        await syncNativeActivation(deps, output, projectRoot);
        printPluginRemoved(output, name);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  plugin
    .command("list")
    .description("List installed plugins for one or all AI tools")
    .option("--tool <toolId>", "Target AI tool (default: all installed)")
    .action(async (cmdOptions: { tool?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertValidAiToolId(cmdOptions.tool);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.pluginListUseCase.execute({
          toolIds: parseToolOption(cmdOptions.tool),
        });
        printInstalledPlugins(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  plugin
    .command("install [plugin]")
    .description("Install a plugin (marketplace name, local path, or interactive pick)")
    .option("--from <market>", "Marketplace name (when multiple match)")
    .option("--tool <toolId>", "Target AI tool (default: all installed)")
    .option("--token <value>", "Auth token (host detected from source URL at fetch time)")
    .option("--scope <user|project>", "Install scope; must match the tool's supported scope")
    .option("--yes", "Auto-resolve interactive prompts (CI mode)")
    .action(
      async (
        pluginArg: string | undefined,
        cmdOptions: {
          from?: string;
          tool?: string;
          token?: string;
          scope?: string;
          yes?: boolean;
        }
      ) => {
        const { verbose, output, projectRoot } = parseGlobalOptions(program);
        const errorHandler = new ErrorHandler(output);
        try {
          assertValidAiToolId(cmdOptions.tool);
          const scope = parseInstallScope(cmdOptions.scope);
          const deps = await createDeps(projectRoot, { verbose, token: cmdOptions.token }, output);
          const result = await deps.pluginInstallUseCase.execute({
            pluginArg,
            toolIds: parseToolOption(cmdOptions.tool),
            projectRoot,
            interactive: process.stdout.isTTY,
            fromMarketplace: cmdOptions.from,
            yes: cmdOptions.yes,
            scope,
          });
          await syncNativeActivation(
            deps,
            output,
            projectRoot,
            cmdOptions.from !== undefined ? [cmdOptions.from] : undefined
          );
          printPluginInstallOutcome(output, result);
        } catch (error) {
          errorHandler.handle(error);
        }
      }
    );

  plugin
    .command("search <query>")
    .description("Search registered marketplaces for plugins")
    .option("--recommended", "Show only recommended plugins")
    .option("--marketplace <name>", "Limit to a single marketplace")
    .action(async (query: string, cmdOptions: { recommended?: boolean; marketplace?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const { hits } = await deps.pluginSearchUseCase.execute({
          query,
          recommendedOnly: cmdOptions.recommended ?? false,
          marketplace: cmdOptions.marketplace,
          projectRoot,
        });
        printPluginSearchHits(output, hits);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  plugin
    .command("update [name]")
    .description("Update one or all plugins for one or all AI tools")
    .option("--tool <toolId>", "Target AI tool (default: all installed)")
    .action(async (name: string | undefined, cmdOptions: { tool?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertValidAiToolId(cmdOptions.tool);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const updated = await deps.pluginUpdateUseCase.execute({
          pluginNames: name !== undefined ? [name] : undefined,
          toolIds: parseToolOption(cmdOptions.tool),
          projectRoot,
        });
        await syncNativeActivation(deps, output, projectRoot);
        printPluginsUpdated(output, updated);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
