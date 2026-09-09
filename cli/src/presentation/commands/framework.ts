import type { Command } from "commander";
import { Manifest } from "../../contexts/framework/domain/manifest.js";
import { isIdeToolId } from "../../contexts/tools/domain/registry.js";
import type { AiToolId, IdeToolId, ToolId } from "../../kernel/tool.js";
import { isAiToolId, VALID_TOOL_IDS } from "../../kernel/tool.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import {
  printInstalledRules,
  printInstalledRulesJson,
} from "../display/installed-rules-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions } from "./global-options.js";
import { reportSyncActivation } from "./sync-native-activation.js";

type Deps = Awaited<ReturnType<typeof createDeps>>;

function assertKnownToolId(toolId: string): asserts toolId is ToolId {
  if (!isAiToolId(toolId) && !isIdeToolId(toolId)) {
    throw new Error(`Unknown tool: ${toolId}. Valid tools: ${VALID_TOOL_IDS.join(", ")}`);
  }
}

async function runFrameworkInstall(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: ToolId,
  cmdOptions: { force: boolean; plugins: boolean }
): Promise<void> {
  assertKnownToolId(toolId);
  if (isAiToolId(toolId)) {
    await installAiTool(deps, output, projectRoot, toolId, cmdOptions);
  } else {
    await installIdeTool(deps, output, projectRoot, toolId, cmdOptions);
  }
}

async function installAiTool(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: AiToolId,
  cmdOptions: { force: boolean; plugins: boolean }
): Promise<void> {
  const version = deps.currentVersionProvider.get();
  const result = await deps.installAiToolUseCase.execute({
    toolId,
    projectRoot,
    force: cmdOptions.force,
    version,
    propagatePlugins: cmdOptions.plugins,
  });
  if (result.runtimeResult.skipped) {
    output.warn(`${toolId} is already installed. Use \`--force\` to reinstall.`);
    return;
  }
  for (const w of result.runtimeResult.warnings) output.warn(w);
  for (const w of result.propagationWarnings) output.warn(w);
  output.success(`Installed ${toolId} (${result.runtimeResult.fileCount} files)`);
  if (result.activation !== undefined) reportSyncActivation(output, result.activation);
}

async function installIdeTool(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: IdeToolId,
  cmdOptions: { force: boolean }
): Promise<void> {
  const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
  const version = deps.currentVersionProvider.get();
  const result = await deps.installIdeToolUseCase.execute({
    toolId,
    projectRoot,
    manifest,
    force: cmdOptions.force,
    version,
  });
  if (result.skipped) {
    output.warn(`${result.toolId} is already installed. Use \`--force\` to reinstall.`);
    return;
  }
  for (const w of result.warnings) output.warn(w);
  output.success(`Installed ${result.toolId} (${result.fileCount} files)`);
}

async function runFrameworkRemove(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: ToolId
): Promise<void> {
  assertKnownToolId(toolId);
  if (isAiToolId(toolId)) {
    const results = await deps.uninstallUseCase.execute({
      toolIds: [toolId],
      projectRoot,
      mcpFilter: [],
    });
    const totalFileCount = results.reduce((sum, r) => sum + r.fileCount, 0);
    output.success(`Removed ${results[0].toolId} (${totalFileCount} files removed)`);
    return;
  }
  const result = await deps.uninstallIdeUseCase.execute({ toolId, projectRoot });
  output.success(`Removed ${result.toolId} (${result.fileCount} files removed)`);
}

interface UpdatedTool {
  toolId: ToolId;
  fileCount: number;
}
interface UpdateErrors {
  scope: string;
  message: string;
}

function printUpdateResult(
  output: CLIOutput,
  updatedTools: readonly UpdatedTool[],
  errors: readonly UpdateErrors[]
): void {
  if (updatedTools.length === 0 && errors.length === 0) {
    output.info("No tools installed.");
    return;
  }
  for (const t of updatedTools) output.success(`Updated ${t.toolId} (${t.fileCount} files)`);
  for (const e of errors) output.warn(`[${e.scope}] ${e.message}`);
}

async function runFrameworkUpdate(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  toolId: ToolId | undefined,
  cmdOptions: { force: boolean }
): Promise<void> {
  if (toolId !== undefined) assertKnownToolId(toolId);
  const interactive = process.stdout.isTTY ?? false;

  if (toolId !== undefined) {
    if (isAiToolId(toolId)) {
      const result = await deps.updateAiToolsUseCase.execute({
        toolArg: toolId,
        projectRoot,
        userForce: cmdOptions.force,
        interactive,
      });
      printUpdateResult(output, result.updatedTools, result.errors);
    } else {
      const result = await deps.updateIdeToolsUseCase.execute({
        toolArg: toolId as IdeToolId,
        projectRoot,
        userForce: cmdOptions.force,
        interactive,
      });
      printUpdateResult(output, result.updatedTools, result.errors);
    }
    return;
  }

  // No `--tool`: fan out across both categories — every installed AI and IDE tool.
  const ai = await deps.updateAiToolsUseCase.execute({
    projectRoot,
    userForce: cmdOptions.force,
    interactive,
  });
  const ide = await deps.updateIdeToolsUseCase.execute({
    projectRoot,
    userForce: cmdOptions.force,
    interactive,
  });
  printUpdateResult(
    output,
    [...ai.updatedTools, ...ide.updatedTools],
    [...ai.errors, ...ide.errors]
  );
}

export function registerFrameworkCommand(program: Command): void {
  const framework = program
    .command("framework")
    .description("Manage the framework's lifecycle on installed tools");

  framework
    .command("install")
    .description(
      "Install a tool's runtime configuration from bundled assets — acts on the framework alone (see `setup`, which bootstraps the whole project)"
    )
    .requiredOption("--tool <tool>", "AI or IDE tool ID")
    .option("-f, --force", "Overwrite already-installed tool", false)
    .option("--no-plugins", "Skip propagation of already-installed plugins onto the new tool")
    .action(async (cmdOptions: { tool: string; force: boolean; plugins: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        await runFrameworkInstall(deps, output, projectRoot, cmdOptions.tool as ToolId, cmdOptions);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  framework
    .command("remove")
    .description(
      "Remove a tool's generated configuration files — removes the framework only (see `clean`, which removes all of AIDD)"
    )
    .requiredOption("--tool <tool>", "AI or IDE tool ID")
    .action(async (cmdOptions: { tool: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        await runFrameworkRemove(deps, output, projectRoot, cmdOptions.tool as ToolId);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  framework
    .command("update")
    .description(
      "Re-install tool configs from bundled CLI assets, moving to a new version (all installed tools if --tool is omitted; see `marketplace refresh`, which re-fetches catalogs instead)"
    )
    .option("--tool <tool>", "Limit update to a specific AI or IDE tool")
    .option("-f, --force", "Overwrite modified files without prompting", false)
    .action(async (cmdOptions: { tool?: string; force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        await runFrameworkUpdate(
          deps,
          output,
          projectRoot,
          cmdOptions.tool as ToolId | undefined,
          cmdOptions
        );
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  framework
    .command("rules")
    .description("List the rules installed in this project, across every AI tool")
    .option("--json", "Print the inventory as JSON")
    .action(async (cmdOptions: { json?: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const { rules } = await deps.listInstalledRulesUseCase.execute({ projectRoot });
        if (cmdOptions.json) printInstalledRulesJson(output, rules);
        else printInstalledRules(output, rules);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
