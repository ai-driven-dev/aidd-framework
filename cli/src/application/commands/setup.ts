import { resolve } from "node:path";
import type { Command } from "commander";
import { MarketplaceSourceMode } from "../../contexts/distribution/domain/marketplace-source-mode.js";
import { SetupUseCase } from "../../contexts/framework/application/setup-use-case.js";
import { SetupFlow } from "../../contexts/framework/domain/setup-flow.js";
import { assertToolIdsMatchCategory } from "../../contexts/tools/domain/registry.js";
import { createDeps } from "../../infrastructure/deps.js";
import type { ToolId } from "../../kernel/tool.js";
import { AI_TOOL_IDS, IDE_TOOL_IDS } from "../../kernel/tool.js";
import { displayInstall, printNextSteps, printWelcomeBanner } from "../display/setup-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions } from "./global-options.js";

interface SetupCmdOptions {
  source?: "remote" | "local";
  path?: string;
  release?: string;
  ai?: string;
  ide?: string;
  plugins?: string;
  yes?: boolean;
  defaultMarketplace?: boolean;
}

function parseSourceFlag(
  cmdOptions: SetupCmdOptions,
  output: CLIOutput
): MarketplaceSourceMode | undefined {
  if (!cmdOptions.source) return undefined;
  if (cmdOptions.source === "local") {
    if (!cmdOptions.path) {
      output.error("--source local requires --path <dir>");
      process.exit(1);
    }
    return MarketplaceSourceMode.local(resolve(cmdOptions.path));
  }
  return MarketplaceSourceMode.remote(undefined, cmdOptions.release);
}

function expandAllKeyword(raw: string | undefined, all: readonly ToolId[]): ToolId[] {
  if (raw === undefined) return [];
  if (raw.trim() === "all") return [...all];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean) as ToolId[];
}

function parseToolIds(
  cmdOptions: SetupCmdOptions,
  errorHandler: ErrorHandler
): { aiTools: ToolId[]; ideTools: ToolId[] } | null {
  const aiIds = expandAllKeyword(cmdOptions.ai, AI_TOOL_IDS);
  const ideIds = expandAllKeyword(cmdOptions.ide, IDE_TOOL_IDS);
  try {
    if (aiIds.length > 0 && cmdOptions.ai?.trim() !== "all")
      assertToolIdsMatchCategory(aiIds, "ai");
    if (ideIds.length > 0 && cmdOptions.ide?.trim() !== "all")
      assertToolIdsMatchCategory(ideIds, "ide");
  } catch (e) {
    errorHandler.handle(e);
    return null;
  }
  return { aiTools: aiIds, ideTools: ideIds };
}

type PluginsMode = "interactive" | "all" | "recommended" | "named" | "none";

function parsePluginsFlag(
  raw: string | undefined,
  interactive: boolean
): { mode: PluginsMode; names: string[] } {
  if (raw === undefined) return { mode: interactive ? "interactive" : "none", names: [] };
  const value = raw.trim();
  if (value === "none") return { mode: "none", names: [] };
  if (value === "all") return { mode: "all", names: [] };
  if (value === "recommended") return { mode: "recommended", names: [] };
  const names = value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { mode: "named", names };
}

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("Set up or update the project to a correct state")
    .option("--source <mode>", "Framework source: remote or local")
    .option("--path <dir>", "Absolute path to local framework (required with --source local)")
    .option("--release <tag>", "Marketplace release tag to fetch (e.g., v1.2.3)")
    .option("--ai <ids>", "Comma-separated AI tool IDs, or 'all' (e.g., claude,cursor or all)")
    .option("--ide <ids>", "Comma-separated IDE tool IDs, or 'all' (e.g., vscode or all)")
    .option(
      "--plugins <mode>",
      "Plugin install mode: none | all | recommended | comma-separated names"
    )
    .option(
      "--no-default-marketplace",
      "Skip auto-registering aidd-framework (no source prompt, no plugin install)"
    )
    .option("--yes", "Accept defaults without prompting")
    .action(async (cmdOptions: SetupCmdOptions) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      const source = parseSourceFlag(cmdOptions, output);
      const toolIds = parseToolIds(cmdOptions, errorHandler);
      if (toolIds === null) return;

      const hasScriptingFlags = !!(
        cmdOptions.source ||
        cmdOptions.release ||
        cmdOptions.ai ||
        cmdOptions.ide ||
        cmdOptions.plugins ||
        cmdOptions.yes
      );
      const interactive = process.stdout.isTTY && !hasScriptingFlags;

      const { mode: pluginMode, names: pluginNames } = parsePluginsFlag(
        cmdOptions.plugins,
        interactive
      );

      const registerDefaultMarketplace = cmdOptions.defaultMarketplace !== false;
      const flow = new SetupFlow({
        projectRoot,
        source,
        aiTools: toolIds.aiTools,
        ideTools: toolIds.ideTools,
        pluginMode,
        pluginNames,
        interactive,
        force: false,
        registerDefaultMarketplace,
      });

      if (interactive) printWelcomeBanner(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);

        const result = await new SetupUseCase(
          deps.fs,
          deps.manifestRepo,
          deps.setupMarketplaceSourceUseCase,
          deps.marketplaceRegisterFrameworkUseCase,
          deps.marketplaceRefreshUseCase,
          deps.marketplaceSyncSettingsUseCase,
          deps.setupToolsUseCase,
          deps.setupPluginsPromptUseCase,
          deps.currentVersionProvider,
          deps.authReader,
          deps.setupToolsPromptUseCase,
          deps.projectContextDetector,
          deps.releaseResolver
        ).execute(flow);

        if (interactive && result.context !== undefined) {
          output.info(`Detected: ${result.context.describe()}.`);
        }
        switch (result.kind) {
          case "initialized": {
            output.success("Project initialized.");
            displayInstall(output, result.install.results, verbose);
            break;
          }
          case "up-to-date": {
            output.info("Project is up to date.");
            displayInstall(output, result.install.results, verbose);
            break;
          }
        }
        if (interactive) printNextSteps(output, result.install.results.length > 0);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
