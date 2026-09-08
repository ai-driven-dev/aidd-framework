import type { Command } from "commander";
import { FRAMEWORK_MARKETPLACE_NAME } from "../../contexts/distribution/domain/marketplace.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions, parseScopeFlag } from "./global-options.js";

type Deps = Awaited<ReturnType<typeof createDeps>>;
// Derived from the wired use case's own return type rather than importing its module
// directly: `clean-user-scope-use-case.ts` is framework's own interior, undeclared
// public (`context-boundary.arch.test.ts`), and this presentation-layer file has no
// standing to reach it — the composition root (`Deps`) is the one door it may use.
type CleanUserScopeResult = Awaited<ReturnType<Deps["cleanUserScopeUseCase"]["execute"]>>;

interface CleanCmdOptions {
  force: boolean;
  scope?: string;
}

async function runProjectScopeClean(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  cmdOptions: CleanCmdOptions
): Promise<void> {
  const result = await deps.cleanUseCase.execute({
    projectRoot,
    force: cmdOptions.force,
    interactive: process.stdout.isTTY,
  });

  if (!result.manifestFound) {
    output.success("Nothing to clean");
    return;
  }

  if (result.dryRun) {
    output.print("The following will be removed:");
    for (const tool of result.preview.tools) {
      output.print(`  ${tool.toolId}: ${tool.fileCount} files`);
    }
    output.print("  manifest: .aidd/ (config.json, if present, is kept)");
    for (const registration of result.preview.nativeRegistrations) {
      output.print(
        `  ${registration.toolId}: ${registration.binary} will be asked to unregister ${registration.pluginRefCount} plugin ref(s) and ${registration.marketplaceCount} marketplace(s)`
      );
      for (const cachePath of registration.cachePaths) {
        output.print(`    cache to purge once unregistered: ${cachePath}`);
      }
    }
    if (result.preview.sharedSourceOtherProjects !== undefined) {
      const otherProjects = result.preview.sharedSourceOtherProjects;
      const projects = otherProjects.length > 0 ? otherProjects.join(", ") : "no other project";
      output.print(`  aidd-framework: shared source, still referenced by: ${projects}`);
    }
    const toolCount = result.preview.tools.length;
    if (process.stdout.isTTY) {
      output.print("No files removed.");
    } else {
      output.success(
        `Would remove ${result.preview.totalFileCount} ${result.preview.totalFileCount === 1 ? "file" : "files"} across ${toolCount} ${toolCount === 1 ? "tool" : "tools"}. Use --force to confirm.`
      );
    }
    return;
  }

  output.success(`Cleaned all AIDD files (${result.fileCount} files removed)`);
}

/** Names, before anything is removed, exactly what `--scope user` is about to purge —
 * the shared source's own versions and the projects `references.json` still names as
 * referencing it, existing paths only (see `UserSourceReferences.listAllReferencingProjects`). */
function printUserScopePreview(output: CLIOutput, result: CleanUserScopeResult): void {
  const { preview } = result;
  output.print("The following will be removed for this machine:");
  for (const toolId of preview.toolIds) {
    output.print(`  ${toolId}: registration will be undone through its own CLI`);
  }
  const versions =
    preview.builtVersions.length > 0 ? preview.builtVersions.join(", ") : "none built yet";
  output.print(`  ${FRAMEWORK_MARKETPLACE_NAME}: shared source (versions: ${versions})`);
  const projects =
    preview.referencingProjects.length > 0
      ? preview.referencingProjects.join(", ")
      : "no other project";
  output.print(`  still referenced by: ${projects}`);
}

async function runUserScopeClean(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  cmdOptions: CleanCmdOptions
): Promise<void> {
  const result = await deps.cleanUserScopeUseCase.execute({
    projectRoot,
    force: cmdOptions.force,
    interactive: process.stdout.isTTY,
  });

  if (result.dryRun) {
    printUserScopePreview(output, result);
    if (process.stdout.isTTY) {
      output.print("No files removed.");
    } else {
      output.success("Use --force to confirm.");
    }
    return;
  }

  if (!result.manifestFound) {
    // The use case itself already logged why: no user-scope manifest existed, so no
    // host registration was there to undo — this only names what the whitelist purge
    // above it just did.
    output.success(`Purged the shared ${FRAMEWORK_MARKETPLACE_NAME} source's machine-local state`);
    return;
  }

  output.success(`Cleaned the shared ${FRAMEWORK_MARKETPLACE_NAME} source for this machine`);
}

export function registerCleanCommand(program: Command): void {
  program
    .command("clean")
    .description(
      "Remove all AIDD-managed files from the project — retires every part of AIDD; see `framework remove`, which removes the framework only"
    )
    .option("--force", "Confirm file removal (skip dry-run)", false)
    .option(
      "--scope <scope>",
      "project (default) cleans this project alone; user undoes the machine-wide " +
        "registration setup --scope user wrote and purges the shared source itself"
    )
    .action(async (cmdOptions: CleanCmdOptions) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      const scope = parseScopeFlag(cmdOptions.scope, output) ?? "project";

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        if (scope === "user") {
          await runUserScopeClean(deps, output, projectRoot, cmdOptions);
        } else {
          await runProjectScopeClean(deps, output, projectRoot, cmdOptions);
        }
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
