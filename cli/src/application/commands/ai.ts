import type { Command } from "commander";
import { DOCS_DIR } from "../../domain/models/paths.js";
import type { AiToolId } from "../../domain/models/tool-ids.js";
import { AI_TOOL_IDS, isAiToolId } from "../../domain/models/tool-ids.js";
import type { ToolId } from "../../domain/tools/registry.js";
import { createDeps, createMenuDeps } from "../../infrastructure/deps.js";
import {
  printInstalledRules,
  printInstalledRulesJson,
} from "../display/installed-rules-display.js";
import { printUnrestorable } from "../display/restore-display.js";
import { ErrorHandler } from "../error-handler.js";
import { NoManifestError } from "../errors.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./shared/spawn-cli-command.js";

function assertAiToolId(toolId: string): asserts toolId is AiToolId {
  if (!isAiToolId(toolId)) {
    throw new Error(`Unknown AI tool: ${toolId}. Valid AI tools: ${AI_TOOL_IDS.join(", ")}`);
  }
}

export function registerAiCommand(program: Command): void {
  const ai = program
    .command("ai")
    .description("Manage AI tools (claude, cursor, copilot, codex, opencode)");

  ai.action(async () => {
    if (!process.stdout.isTTY) {
      ai.help();
      return;
    }
    const { prompter } = createMenuDeps(process.cwd());
    const choice = await prompter.select("ai: what do you want to do?", [
      { name: "Install an AI tool", value: "install", description: "requires tool arg" },
      { name: "Uninstall an AI tool", value: "uninstall", description: "requires tool arg" },
      { name: "List installed AI tools", value: "list" },
      { name: "Show AI tool status", value: "status" },
      { name: "Update AI tools", value: "update" },
      { name: "Restore AI tool files", value: "restore" },
      { name: "Doctor AI tools", value: "doctor" },
    ]);
    await spawnCliCommand(["ai", choice]);
  });

  ai.command("install <tool>")
    .description("Install an AI tool runtime configuration from bundled assets")
    .option("-f, --force", "Overwrite already-installed tool", false)
    .option("--no-plugins", "Skip propagation of already-installed plugins onto the new tool")
    .action(async (toolArg: string, cmdOptions: { force: boolean; plugins: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertAiToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const version = deps.currentVersionProvider.get();
        const result = await deps.installAiToolUseCase.execute({
          toolId: toolArg,
          projectRoot,
          force: cmdOptions.force,
          version,
          propagatePlugins: cmdOptions.plugins,
        });
        if (result.runtimeResult.skipped) {
          output.warn(`${toolArg} is already installed. Use \`--force\` to reinstall.`);
          return;
        }
        for (const w of result.runtimeResult.warnings) output.warn(w);
        for (const w of result.propagationWarnings) output.warn(w);
        output.success(`Installed ${toolArg} (${result.runtimeResult.fileCount} files)`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ai.command("uninstall <tool>")
    .description("Remove an AI tool's generated configuration files")
    .action(async (toolArg: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertAiToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const results = await deps.uninstallUseCase.execute({
          toolIds: [toolArg as ToolId],
          projectRoot,
          mcpFilter: [],
        });
        const totalFileCount = results.reduce((sum, r) => sum + r.fileCount, 0);
        output.success(`Uninstalled ${results[0].toolId} (${totalFileCount} files removed)`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ai.command("list")
    .description("List installed AI tools")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const manifest = await deps.manifestRepo.load();
        if (!manifest) {
          output.info("No tools installed. Run `aidd setup` to get started.");
          return;
        }
        const aiIds = manifest.getInstalledToolIds().filter(isAiToolId);
        if (aiIds.length === 0) {
          output.info("No AI tools installed.");
          return;
        }
        for (const id of aiIds) output.print(id);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ai.command("rules")
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

  ai.command("status")
    .description("Show drift for AI tools (optionally filtered by tool and/or plugin)")
    .option("--tool <tool>", "Limit status to a specific AI tool")
    .option("--plugin <name>", "Limit status to a specific plugin")
    .action(async (cmdOptions: { tool?: string; plugin?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        if (cmdOptions.tool !== undefined) assertAiToolId(cmdOptions.tool);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const report = await deps.statusUseCase.execute({
          projectRoot,
          filterToolId: cmdOptions.tool as AiToolId | undefined,
          category: "ai",
          pluginName: cmdOptions.plugin,
        });
        if (report.inSync) {
          output.success("All AI tool files are in sync");
          return;
        }
        for (const tool of report.tools) {
          if (tool.drifted.length === 0) {
            output.print(`${tool.toolId} (v${tool.version}): in sync`);
            continue;
          }
          output.print(`${tool.toolId} (v${tool.version}):`);
          for (const f of tool.drifted) output.print(`  ${f.status} ${f.relativePath}`);
        }
        for (const entry of report.pluginDrift) {
          output.print(
            `  plugin ${entry.pluginName} (${entry.toolId}): ${entry.driftedFiles.length} file(s) modified`
          );
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ai.command("update [tool]")
    .description("Re-install AI tool configs from bundled CLI assets")
    .option("-f, --force", "Overwrite modified files without prompting", false)
    .action(async (toolArg: string | undefined, cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        if (toolArg !== undefined) assertAiToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.updateAiToolsUseCase.execute({
          toolArg: toolArg as AiToolId | undefined,
          projectRoot,
          userForce: cmdOptions.force,
          interactive: process.stdout.isTTY ?? false,
        });
        if (result.updatedTools.length === 0 && result.errors.length === 0) {
          output.info("No AI tools installed.");
          return;
        }
        for (const t of result.updatedTools) {
          output.success(`Updated ${t.toolId} (${t.fileCount} files)`);
        }
        for (const e of result.errors) {
          output.warn(`[${e.scope}] ${e.message}`);
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ai.command("restore [files...]")
    .description("Restore AI tool tracked files to their installed version")
    .option("-f, --force", "Restore without prompting", false)
    .option("--tool <tool>", "Limit restore to a specific AI tool")
    .option("--plugin <name>", "Limit restore to a specific plugin")
    .action(
      async (
        fileArgs: string[],
        cmdOptions: { force: boolean; tool?: string; plugin?: string }
      ) => {
        const { verbose, output, projectRoot } = parseGlobalOptions(program);
        const errorHandler = new ErrorHandler(output);
        try {
          if (cmdOptions.tool !== undefined) {
            assertAiToolId(cmdOptions.tool);
          }
          const deps = await createDeps(projectRoot, { verbose }, output);
          const manifest = await deps.manifestRepo.load();
          if (!manifest) throw new NoManifestError();
          const version =
            manifest
              .getInstalledToolIds()
              .map((id) => manifest.getToolVersion(id))
              .find((v) => v !== undefined) ?? deps.currentVersionProvider.get();
          const toolIds: ToolId[] | undefined = cmdOptions.tool
            ? [cmdOptions.tool as ToolId]
            : manifest.getInstalledToolIds().filter(isAiToolId);
          const result = await deps.restoreUseCase.execute({
            version,
            docsDir: DOCS_DIR,
            projectRoot,
            toolIds,
            files: fileArgs.length > 0 ? fileArgs : undefined,
            force: cmdOptions.force,
            interactive: process.stdout.isTTY,
            manifest,
            pluginName: cmdOptions.plugin,
          });
          const nothingDone = result.tools.every((t) => t.nothingToRestore);
          if (nothingDone) {
            output.success("Nothing to restore — all files are unmodified.");
            return;
          }
          const restored = result.totalRestored;
          const kept = result.totalKept;
          output.success(
            `Restored ${restored} ${restored === 1 ? "file" : "files"}, kept ${kept} ${kept === 1 ? "file" : "files"}`
          );
          printUnrestorable(output, result.unrestorable);
        } catch (error) {
          errorHandler.handle(error);
        }
      }
    );

  ai.command("doctor")
    .description("Check AI tool installation health (optionally filtered by plugin)")
    .option("--plugin <name>", "Limit doctor to a specific plugin")
    .action(async (cmdOptions: { plugin?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const report = await deps.doctorUseCase.execute({
          projectRoot,
          category: "ai",
          pluginName: cmdOptions.plugin,
        });
        if (report.healthy) {
          output.success("AI tool installation is healthy");
          return;
        }
        for (const issue of report.issues) {
          const text = `${issue.message}\n  Fix: ${issue.fix}`;
          if (issue.severity === "error") output.error(text);
          else output.warn(text);
        }
        // Health also accounts for plugin issues; render them too so an exit
        // driven solely by a plugin defect never goes silent.
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
