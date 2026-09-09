import type { Command } from "commander";
import type { MarketplaceScope } from "../../kernel/scope.js";
import { parsePluginSourceShorthand } from "../../kernel/source.js";
import { createDeps, createMenuDeps } from "../../runtime/wiring/framework.js";
import {
  printMarketplaceCheck,
  printMarketplaceRegistered,
  printMarketplaceRemoved,
  printRefreshResults,
  printRegisteredMarketplaces,
} from "../display/marketplace-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./spawn-cli-command.js";
import { syncNativeActivation } from "./sync-native-activation.js";

export function registerMarketplaceCommand(program: Command): void {
  const marketplace = program.command("marketplace").description("Manage plugin marketplaces");

  marketplace.action(async () => {
    if (!process.stdout.isTTY) {
      marketplace.help();
      return;
    }
    const { prompter } = createMenuDeps(process.cwd());
    const choice = await prompter.select("marketplace: what do you want to do?", [
      { name: "List marketplaces", value: "list" },
      { name: "Add marketplace", value: "add" },
      { name: "Refresh marketplaces", value: "refresh" },
      { name: "Remove marketplace", value: "remove", description: "requires name arg" },
      { name: "Check marketplaces", value: "check" },
    ]);
    await spawnCliCommand(["marketplace", choice]);
  });

  marketplace
    .command("add [name] [source]")
    .description("Register a plugin marketplace")
    .option("--scope <user|project>", "Registration scope (default: project)", "project")
    .option("--yes", "Skip the trust + cleanup prompts")
    .option("--overwrite", "Replace an existing marketplace with the same name")
    .option("--token <value>", "Auth token (host detected from source URL at fetch time)")
    .action(
      async (
        nameArg: string | undefined,
        sourceArg: string | undefined,
        cmdOptions: {
          scope?: string;
          yes?: boolean;
          overwrite?: boolean;
          token?: string;
        }
      ) => {
        const { verbose, output, projectRoot } = parseGlobalOptions(program);
        const errorHandler = new ErrorHandler(output);
        const interactive = process.stdout.isTTY;
        if (!interactive && (!nameArg || !sourceArg)) {
          output.error("name and source are required in non-interactive mode.");
          process.exit(1);
        }
        if (
          cmdOptions.scope !== undefined &&
          cmdOptions.scope !== "project" &&
          cmdOptions.scope !== "user"
        ) {
          output.error(`Invalid --scope '${cmdOptions.scope}'. Expected 'project' or 'user'.`);
          process.exit(1);
        }
        try {
          const scope: MarketplaceScope = cmdOptions.scope === "user" ? "user" : "project";
          const deps = await createDeps(projectRoot, { verbose, token: cmdOptions.token }, output);
          const name = nameArg ?? (await deps.prompter.input("Marketplace name:"));
          const rawSource = sourceArg ?? (await deps.prompter.input("Source (path or user/repo):"));
          const source = parsePluginSourceShorthand(rawSource);
          const result = await deps.marketplaceAddUseCase.execute({
            source,
            name,
            scope,
            projectRoot,
            autoTrust: cmdOptions.yes ?? false,
            overwrite: cmdOptions.overwrite ?? false,
          });
          await syncNativeActivation(deps, output, projectRoot, [result.marketplace.name]);
          printMarketplaceRegistered(output, result.marketplace.name);
        } catch (error) {
          errorHandler.handle(error);
        }
      }
    );

  marketplace
    .command("list")
    .description("List registered plugin marketplaces")
    .option("--plugins", "Also fetch and print all plugins from each marketplace catalog")
    .action(async (cmdOptions: { plugins?: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const { marketplaces, catalogs } = await deps.marketplaceListUseCase.execute({
          projectRoot,
          withCatalogs: cmdOptions.plugins ?? false,
        });
        printRegisteredMarketplaces(output, marketplaces, catalogs);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  marketplace
    .command("remove <name>")
    .description("Remove a registered plugin marketplace")
    .option("--yes", "Skip the orphan-cleanup prompt")
    .action(async (name: string, cmdOptions: { yes?: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.marketplaceRemoveUseCase.execute({
          name,
          projectRoot,
          autoConfirm: cmdOptions.yes ?? false,
        });
        await syncNativeActivation(deps, output, projectRoot);
        printMarketplaceRemoved(output, result.marketplace.name, result.removedPluginCount);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  marketplace
    .command("refresh [name]")
    .description(
      "Refresh registered marketplaces — re-fetches catalogs; see `framework update`, which moves installed tools to a new version instead"
    )
    .option("--force", "Clear cache before re-fetching")
    .action(async (name: string | undefined, cmdOptions: { force?: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const { results, failedCount } = await deps.marketplaceRefreshUseCase.execute({
          projectRoot,
          name,
          force: cmdOptions.force,
        });
        await syncNativeActivation(deps, output, projectRoot);
        printRefreshResults(output, results);
        if (failedCount > 0) process.exit(1);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  marketplace
    .command("check")
    .description("Report stale marketplaces and upstream-removed plugins")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.marketplaceCheckUseCase.execute({ projectRoot });
        printMarketplaceCheck(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
