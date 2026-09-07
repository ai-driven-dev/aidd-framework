import type { Command } from "commander";
import {
  NoManifestError,
  SyncFailedError,
  UserScopeFilterUnsupportedError,
} from "../../kernel/errors.js";
import type { ToolId } from "../../kernel/tool.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printNativeActivation, printUnrestorable } from "../display/restore-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions, parseScopeFlag } from "./global-options.js";

interface SyncCmdOptions {
  force: boolean;
  tool?: string;
  plugin?: string;
  scope?: string;
}

/**
 * `--scope user` has no project-scope tracked files to restore — a user-scope install
 * writes nothing under any project — so this skips `restoreAllUseCase` entirely and
 * drives only what a user-scope install actually has: the shared marketplace's own
 * native activation, read from and written to `deps.userManifestRepo`, never this
 * project's own `.aidd/manifest.json`.
 */
async function runUserScopeSync(
  deps: Awaited<ReturnType<typeof createDeps>>,
  output: CLIOutput,
  projectRoot: string,
  fileArgs: string[],
  cmdOptions: SyncCmdOptions
): Promise<void> {
  // Neither has a user-scope counterpart: no plugin is tracked there yet, and a
  // user-scope manifest entry carries no files to narrow by name. Refused rather than
  // silently read and discarded.
  if (cmdOptions.plugin !== undefined) {
    throw new UserScopeFilterUnsupportedError("--plugin", "sync --plugin <name>");
  }
  if (fileArgs.length > 0) {
    throw new UserScopeFilterUnsupportedError("a file argument", "sync <files...>");
  }
  const toolIds = cmdOptions.tool !== undefined ? [cmdOptions.tool as ToolId] : undefined;
  const activation = await deps.marketplaceSyncSettingsUseCase.execute({
    projectRoot,
    scope: "user",
    manifestRepo: deps.userManifestRepo,
    toolIds,
    recreateFrameworkIfMissing: true,
  });
  printNativeActivation(output, activation.binaryMissing);
  for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);
  if (activation.errors.length > 0) throw new SyncFailedError(activation.errors);
  if (activation.activated.length === 0) {
    output.success("Nothing to sync — no tool is registered at user scope yet.");
  } else {
    output.success(`Synced native activation for: ${activation.activated.join(", ")}`);
  }
}

async function runSyncAction(
  program: Command,
  fileArgs: string[],
  cmdOptions: SyncCmdOptions
): Promise<void> {
  const { verbose, output, projectRoot } = parseGlobalOptions(program);
  const errorHandler = new ErrorHandler(output);
  try {
    const deps = await createDeps(projectRoot, { verbose }, output);
    const scope = parseScopeFlag(cmdOptions.scope, output) ?? "project";

    if (scope === "user") {
      await runUserScopeSync(deps, output, projectRoot, fileArgs, cmdOptions);
      return;
    }

    if (cmdOptions.tool !== undefined) {
      await runScopedSync(deps, output, projectRoot, fileArgs, cmdOptions);
      return;
    }

    const interactive = !cmdOptions.force && process.stdout.isTTY;
    const result = await deps.restoreAllUseCase.execute(projectRoot, cmdOptions.force, interactive);
    for (const e of result.errors) output.warn(`[${e.scope}] ${e.message}`);

    const nothingToRestore =
      result.errors.length === 0 &&
      result.totalRestored === 0 &&
      result.pluginNamesRestored.length === 0 &&
      result.unrestorable.length === 0;
    if (nothingToRestore) {
      output.success("Nothing to restore — all files are unmodified.");
    } else {
      if (result.totalRestored > 0) {
        output.success(
          `Restored ${result.totalRestored} file(s), kept ${result.totalKept} file(s)`
        );
      }
      if (result.pluginNamesRestored.length > 0) {
        output.success(`Restored plugins: ${result.pluginNamesRestored.join(", ")}`);
      }
      printUnrestorable(output, result.unrestorable);
    }

    // After restoration, never before: activation drives the same host CLI that writes
    // into the settings file restoration just regenerated, and `sync` needs the
    // regenerated file on disk before that CLI touches it, not a file restoration is
    // about to overwrite underneath it.
    const activation = await deps.marketplaceSyncSettingsUseCase.execute({
      projectRoot,
      recreateFrameworkIfMissing: true,
    });
    printNativeActivation(output, activation.binaryMissing);
    for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);

    // A run that errored synced nothing for that scope, and reporting success would call
    // that the healthy state. `errorHandler` is what turns this into a non-zero exit; the
    // detail already reached the user through the warnings above.
    const errors = [...result.errors, ...activation.errors];
    if (errors.length > 0) throw new SyncFailedError(errors);
  } catch (error) {
    errorHandler.handle(error);
  }
}

async function runScopedSync(
  deps: Awaited<ReturnType<typeof createDeps>>,
  output: CLIOutput,
  projectRoot: string,
  fileArgs: string[],
  cmdOptions: SyncCmdOptions
): Promise<void> {
  const toolId = cmdOptions.tool as ToolId;
  const manifest = await deps.manifestRepo.load();
  if (!manifest) throw new NoManifestError();
  const version = manifest.getToolVersion(toolId) ?? deps.currentVersionProvider.get();
  const result = await deps.restoreUseCase.execute({
    version,
    projectRoot,
    toolIds: [toolId],
    files: fileArgs.length > 0 ? fileArgs : undefined,
    force: cmdOptions.force,
    interactive: process.stdout.isTTY,
    manifest,
    pluginName: cmdOptions.plugin,
  });
  const nothingDone = result.tools.every((t) => t.nothingToRestore);
  if (nothingDone) {
    output.success("Nothing to restore — all files are unmodified.");
  } else {
    output.success(
      `Restored ${result.totalRestored} ${result.totalRestored === 1 ? "file" : "files"}, kept ${result.totalKept} ${result.totalKept === 1 ? "file" : "files"}`
    );
    printUnrestorable(output, result.unrestorable);
  }

  // Same order as the full sync: restore this tool's files first, only then drive its
  // own CLI — narrowed to this one tool, so fixing it does not silently re-drive every
  // other installed tool's activation too.
  const activation = await deps.marketplaceSyncSettingsUseCase.execute({
    projectRoot,
    toolIds: [toolId],
    recreateFrameworkIfMissing: true,
  });
  printNativeActivation(output, activation.binaryMissing);
  for (const e of activation.errors) output.warn(`[${e.scope}] ${e.message}`);
  if (activation.errors.length > 0) throw new SyncFailedError(activation.errors);
}

export function registerSyncCommand(program: Command): void {
  program
    .command("sync")
    .description(
      "Rewrite owned files from what is already there — regenerate tracked files, driven by the manifest (see `translate`, which converts a source without recording anything)"
    )
    .argument("[files...]", "Limit sync to specific tracked files")
    .option("-f, --force", "Sync without prompting", false)
    .option("--tool <tool>", "Limit sync to a specific tool")
    .option("--plugin <name>", "Limit sync to a specific plugin")
    .option(
      "--scope <scope>",
      "project (default) resolves this project's own manifest; user resolves the " +
        "machine-wide manifest --scope user setup wrote, restoring no project files"
    )
    .action(async (fileArgs: string[], cmdOptions: SyncCmdOptions) => {
      await runSyncAction(program, fileArgs, cmdOptions);
    });
}
