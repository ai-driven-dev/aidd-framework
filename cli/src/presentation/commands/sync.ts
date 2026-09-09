import type { Command } from "commander";
import {
  NoManifestError,
  SyncFailedError,
  UserScopeFilterUnsupportedError,
} from "../../kernel/errors.js";
import type { ToolId } from "../../kernel/tool.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import {
  printActivationOutcome,
  printRestoreOutcome,
  printToolRestoreOutcome,
  printUserScopeSyncOutcome,
} from "../display/sync-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions, parseScopeFlag } from "./global-options.js";

interface SyncCmdOptions {
  force: boolean;
  tool?: string;
  plugin?: string;
  scope?: string;
}

/** A user-scope install writes nothing under any project, so this skips `restoreAllUseCase`
 * and drives only native activation, through `deps.userManifestRepo` and never this
 * project's own manifest. */
async function runUserScopeSync(
  deps: Awaited<ReturnType<typeof createDeps>>,
  output: CLIOutput,
  projectRoot: string,
  fileArgs: string[],
  cmdOptions: SyncCmdOptions
): Promise<void> {
  // Neither has a user-scope counterpart, so both are refused rather than read and
  // silently discarded.
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
  printActivationOutcome(output, activation);
  if (activation.errors.length > 0) throw new SyncFailedError(activation.errors);
  printUserScopeSyncOutcome(output, activation.activated);
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
    printRestoreOutcome(output, result);

    // After restoration, never before: activation drives the host CLI that writes into the
    // settings file restoration regenerates, which must be on disk before that CLI runs.
    const activation = await deps.marketplaceSyncSettingsUseCase.execute({
      projectRoot,
      recreateFrameworkIfMissing: true,
    });
    printActivationOutcome(output, activation);

    // A run that errored synced nothing for that scope, so reporting success would name the
    // unhealthy state healthy. `errorHandler` turns this into the non-zero exit.
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
  printToolRestoreOutcome(output, result);

  // Same order as the full sync, narrowed to this one tool so fixing it re-drives no other
  // installed tool's activation.
  const activation = await deps.marketplaceSyncSettingsUseCase.execute({
    projectRoot,
    toolIds: [toolId],
    recreateFrameworkIfMissing: true,
  });
  printActivationOutcome(output, activation);
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
