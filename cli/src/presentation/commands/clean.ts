import type { Command } from "commander";
import { createDeps } from "../../runtime/wiring/framework.js";
import { printProjectCleanOutcome, printUserScopeCleanOutcome } from "../display/clean-display.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions, parseScopeFlag } from "./global-options.js";

type Deps = Awaited<ReturnType<typeof createDeps>>;

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
  const interactive = process.stdout.isTTY === true;
  const result = await deps.cleanUseCase.execute({
    projectRoot,
    force: cmdOptions.force,
    interactive,
  });

  printProjectCleanOutcome(output, result, interactive);
}

async function runUserScopeClean(
  deps: Deps,
  output: CLIOutput,
  projectRoot: string,
  cmdOptions: CleanCmdOptions
): Promise<void> {
  const interactive = process.stdout.isTTY === true;
  const result = await deps.cleanUserScopeUseCase.execute({
    projectRoot,
    force: cmdOptions.force,
    interactive,
  });

  printUserScopeCleanOutcome(output, result, interactive);
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
