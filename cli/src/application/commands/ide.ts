import type { Command } from "commander";
import { Manifest } from "../../domain/models/manifest.js";
import { DOCS_DIR } from "../../domain/models/paths.js";
import { IDE_TOOL_IDS, type IdeToolId } from "../../domain/models/tool-ids.js";
import { createDeps, createMenuDeps } from "../../infrastructure/deps.js";
import { printUnrestorable } from "../display/restore-display.js";
import { ErrorHandler } from "../error-handler.js";
import { NoManifestError } from "../errors.js";
import { parseGlobalOptions } from "./global-options.js";
import { spawnCliCommand } from "./shared/spawn-cli-command.js";

function assertIdeToolId(toolId: string): asserts toolId is IdeToolId {
  if (!(IDE_TOOL_IDS as readonly string[]).includes(toolId)) {
    throw new Error(`Unknown IDE tool: ${toolId}. Valid IDE tools: ${IDE_TOOL_IDS.join(", ")}`);
  }
}

export function registerIdeCommand(program: Command): void {
  const ide = program.command("ide").description("Manage IDE integrations (vscode)");

  ide.action(async () => {
    if (!process.stdout.isTTY) {
      ide.help();
      return;
    }
    const { prompter } = createMenuDeps(process.cwd());
    const choice = await prompter.select("ide: what do you want to do?", [
      { name: "Install an IDE tool", value: "install", description: "requires tool arg" },
      { name: "Uninstall an IDE tool", value: "uninstall", description: "requires tool arg" },
      { name: "List installed IDE tools", value: "list" },
      { name: "Show IDE tool status", value: "status" },
      { name: "Update IDE tools", value: "update" },
      { name: "Restore IDE tool files", value: "restore" },
      { name: "Doctor IDE tools", value: "doctor" },
    ]);
    await spawnCliCommand(["ide", choice]);
  });

  ide
    .command("install <tool>")
    .description("Install an IDE integration from bundled assets")
    .option("-f, --force", "Overwrite already-installed tool", false)
    .action(async (toolArg: string, cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertIdeToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const manifest = (await deps.manifestRepo.load()) ?? Manifest.create();
        const version = deps.currentVersionProvider.get();
        const result = await deps.installIdeToolUseCase.execute({
          toolId: toolArg,
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
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ide
    .command("uninstall <tool>")
    .description("Remove an IDE tool from the manifest")
    .action(async (toolArg: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        assertIdeToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.uninstallIdeUseCase.execute({ toolId: toolArg, projectRoot });
        output.success(`Uninstalled ${result.toolId} (${result.fileCount} files removed)`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ide
    .command("list")
    .description("List installed IDE tools")
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
        const ideIds = manifest
          .getInstalledToolIds()
          .filter((id) => (IDE_TOOL_IDS as readonly string[]).includes(id));
        if (ideIds.length === 0) {
          output.info("No IDE tools installed.");
          return;
        }
        for (const id of ideIds) output.print(id);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ide
    .command("status")
    .description("Show drift for IDE tools")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const report = await deps.statusUseCase.execute({
          projectRoot,
          filterToolId: undefined,
          category: "ide",
        });
        if (report.inSync) {
          output.success("All IDE tool files are in sync");
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
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ide
    .command("update [tool]")
    .description("Re-install IDE tool configs from bundled CLI assets")
    .option("-f, --force", "Overwrite modified files without prompting", false)
    .action(async (toolArg: string | undefined, cmdOptions: { force: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        if (toolArg !== undefined) assertIdeToolId(toolArg);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.updateIdeToolsUseCase.execute({
          toolArg: toolArg as IdeToolId | undefined,
          projectRoot,
          userForce: cmdOptions.force,
          interactive: process.stdout.isTTY ?? false,
        });
        if (result.updatedTools.length === 0 && result.errors.length === 0) {
          output.info("No IDE tools installed.");
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

  ide
    .command("restore [files...]")
    .description("Restore IDE tool tracked files to their installed version")
    .option("-f, --force", "Restore without prompting", false)
    .option("--tool <tool>", "Limit restore to a specific IDE tool")
    .action(async (fileArgs: string[], cmdOptions: { force: boolean; tool?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        if (cmdOptions.tool !== undefined) assertIdeToolId(cmdOptions.tool);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const manifest = await deps.manifestRepo.load();
        if (!manifest) throw new NoManifestError();
        const version =
          manifest
            .getInstalledToolIds()
            .map((id) => manifest.getToolVersion(id))
            .find((v) => v !== undefined) ?? deps.currentVersionProvider.get();
        const installedIdeIds = manifest
          .getInstalledToolIds()
          .filter((id) => (IDE_TOOL_IDS as readonly string[]).includes(id)) as IdeToolId[];
        const toolIds: IdeToolId[] = cmdOptions.tool
          ? [cmdOptions.tool as IdeToolId]
          : installedIdeIds;
        if (toolIds.length === 0) {
          output.info("No IDE tools installed.");
          return;
        }
        const result = await deps.restoreUseCase.execute({
          version,
          docsDir: DOCS_DIR,
          projectRoot,
          toolIds,
          files: fileArgs.length > 0 ? fileArgs : undefined,
          force: cmdOptions.force,
          interactive: process.stdout.isTTY,
          manifest,
        });
        const nothingDone = result.tools.every((t) => t.nothingToRestore);
        if (nothingDone) {
          output.success("Nothing to restore — all files are unmodified.");
          return;
        }
        output.success(
          `Restored ${result.totalRestored} ${result.totalRestored === 1 ? "file" : "files"}, kept ${result.totalKept} ${result.totalKept === 1 ? "file" : "files"}`
        );
        printUnrestorable(output, result.unrestorable);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  ide
    .command("doctor")
    .description("Check IDE tool installation health and detect issues")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const report = await deps.doctorUseCase.execute({ projectRoot, category: "ide" });
        if (report.healthy) {
          output.success("IDE tool installation is healthy");
          return;
        }
        for (const issue of report.issues) {
          const text = `${issue.message}\n  Fix: ${issue.fix}`;
          if (issue.severity === "error") output.error(text);
          else output.warn(text);
        }
        process.exit(1);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
