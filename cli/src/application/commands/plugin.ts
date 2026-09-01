import type { Command } from "commander";
import { parseInstallScope } from "../../domain/models/install-scope.js";
import { createDeps, createMenuDeps } from "../../infrastructure/deps.js";
import { assertValidAiToolId, parseToolOption } from "../../kernel/tool.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./spawn-cli-command.js";

export function registerPluginCommand(program: Command): void {
  const plugin = program.command("plugin").description("Manage plugins for AI tools");

  plugin.action(async () => {
    if (!process.stdout.isTTY) {
      plugin.help();
      return;
    }
    const { prompter } = createMenuDeps(process.cwd());
    const choice = await prompter.select("plugin: what do you want to do?", [
      { name: "Create a plugin", value: "create", description: "scaffold a new plugin" },
      { name: "Install plugin", value: "install" },
      { name: "List installed plugins", value: "list" },
      { name: "Search plugins", value: "search", description: "requires query arg" },
      { name: "Update plugins", value: "update" },
      { name: "Remove a plugin", value: "remove", description: "requires name arg" },
      { name: "Plugin doctor", value: "doctor" },
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
        await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
        output.success(`Plugin '${name}' removed.`);
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
        let printed = false;
        for (const [toolId, plugins] of result) {
          if (plugins.length === 0) continue;
          output.print(`${toolId}:`);
          for (const p of plugins) output.print(`  ${p.name}@${p.version}`);
          printed = true;
        }
        if (!printed) output.info("No plugins installed.");
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
          const deps = await createDeps(projectRoot, { verbose }, output);
          const result = await deps.pluginInstallUseCase.execute({
            pluginArg,
            toolIds: parseToolOption(cmdOptions.tool),
            projectRoot,
            interactive: process.stdout.isTTY,
            fromMarketplace: cmdOptions.from,
            token: cmdOptions.token,
            yes: cmdOptions.yes,
            scope,
          });
          await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
          if (result.kind === "picked") {
            if (result.installed.length === 0) {
              output.info("No plugins selected.");
            } else {
              output.success(
                `Installed ${result.installed.length} plugin(s): ${result.installed.join(", ")}`
              );
            }
          } else if (result.kind === "local") {
            output.success("Plugin added successfully.");
          } else {
            output.success(`Installed '${result.installed[0]}'.`);
          }
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
        if (hits.length === 0) output.info("No matches.");
        for (const h of hits) {
          const flag = h.entry.recommended ? " (recommended)" : "";
          output.print(
            `${h.entry.name}@${h.entry.version ?? "?"} — ${h.entry.description ?? ""} — marketplace: ${h.marketplace.name}${flag}`
          );
        }
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
        await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
        if (updated.length === 0) {
          output.success("All plugins are up to date.");
        } else {
          output.success(`Updated: ${updated.join(", ")}.`);
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  plugin
    .command("doctor")
    .description("Check plugin installation health")
    .option("--plugin <name>", "Filter check to one plugin")
    .action(async (cmdOptions: { plugin?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const report = await deps.doctorUseCase.execute({
          projectRoot,
          pluginName: cmdOptions.plugin,
        });
        // Plugin doctor is plugin-scoped: gate on plugin issues only, never on
        // unrelated tracked-file / reference / layout warnings the full report
        // also carries. Otherwise it exits non-zero while printing nothing (it
        // only renders pluginIssues) — a silent failure.
        if (report.pluginIssues.length === 0) {
          output.success("Plugin installation is healthy");
          return;
        }
        for (const pi of report.pluginIssues) {
          output.error(
            `Plugin ${pi.pluginName} (${pi.toolId}): ${pi.issue} — ${pi.filePath}\n  Fix: Run \`aidd ai restore\` to restore.`
          );
        }
        process.exit(1);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
