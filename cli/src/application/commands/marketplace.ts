import type { Command } from "commander";
import type { MarketplaceScope } from "../../domain/models/marketplace.js";
import {
  describePluginSource,
  parsePluginSourceShorthand,
} from "../../domain/models/plugin-source.js";
import { createDeps, createMenuDeps } from "../../infrastructure/deps.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./spawn-cli-command.js";

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
          if (cmdOptions.token) process.env.AIDD_TOKEN = cmdOptions.token;
          const scope: MarketplaceScope = cmdOptions.scope === "user" ? "user" : "project";
          const deps = await createDeps(projectRoot, { verbose }, output);
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
          await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
          output.success(`Marketplace '${result.marketplace.name}' registered.`);
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
        if (marketplaces.length === 0) output.info("No marketplaces registered.");
        for (const m of marketplaces) {
          const ver = m.version !== undefined ? ` v${m.version}` : "";
          output.print(`${m.name}${ver} [${m.scope}]`);
          if (catalogs !== undefined) printCatalogEntries(m.name, catalogs, output);
        }
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
        await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
        output.success(
          `Marketplace '${result.marketplace.name}' removed (${result.removedPluginCount} plugin(s) cleaned up).`
        );
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  marketplace
    .command("refresh [name]")
    .description("Refresh registered marketplaces")
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
        await deps.marketplaceSyncSettingsUseCase.execute({ projectRoot });
        for (const r of results)
          output.print(`${r.name}: ${r.status}${r.error ? ` (${r.error})` : ""}`);
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
        const { stale, upstreamRemoved, skipped } = await deps.marketplaceCheckUseCase.execute({
          projectRoot,
        });
        for (const m of stale) output.print(`stale: ${m.name}`);
        for (const r of upstreamRemoved)
          output.print(`removed: ${r.marketplace}/${r.plugin} (${r.toolId})`);
        for (const s of skipped) output.warn(`skipped: ${s.marketplace} — ${s.error}`);
        if (stale.length === 0 && upstreamRemoved.length === 0 && skipped.length === 0)
          output.success("All marketplaces fresh.");
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}

function printCatalogEntries(
  marketplaceName: string,
  catalogs: Map<string, import("../../domain/models/plugin-catalog.js").PluginCatalog>,
  output: ReturnType<typeof parseGlobalOptions>["output"]
): void {
  const catalog = catalogs.get(marketplaceName);
  if (catalog === undefined) {
    output.warn(`  (could not fetch catalog for '${marketplaceName}')`);
    return;
  }
  for (const e of catalog.plugins) {
    const flag = e.recommended ? " (recommended)" : "";
    output.print(
      `  ${e.name}@${e.version ?? "?"} — ${e.description ?? ""} — ${describePluginSource(e.source)}${flag}`
    );
  }
}
