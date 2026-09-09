import readline from "node:readline";
import { resolveProjectRoot } from "../../runtime/project-root/project-root.js";
import { createMenuDeps } from "../../runtime/wiring/framework.js";
import { printBanner } from "../display/menu-display.js";
import { ErrorHandler } from "../error-handler.js";
import { CLIOutput } from "../output.js";
import { InteractiveMenuUseCase } from "../prompts/menu-use-case.js";
import { spawnCliCommand } from "./spawn-cli-command.js";

async function waitForEnter(): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>((resolve) => {
    rl.question("\nPress ENTER to continue...", () => {
      rl.close();
      resolve();
    });
  });
}

/** The name inquirer gives the error it throws when the user hits Ctrl-C at a prompt. */
const USER_ABORT_ERROR_NAME = "ExitPromptError";

export function isUserAbort(error: unknown): boolean {
  return error instanceof Error && error.name === USER_ABORT_ERROR_NAME;
}

export function routeMenuError(error: unknown, errorHandler: ErrorHandler): never {
  if (isUserAbort(error)) process.exit(0);
  return errorHandler.handle(error);
}

export async function runMenuLoop(): Promise<never> {
  const output = new CLIOutput();
  printBanner(output);
  const { manifestRepo, prompter } = createMenuDeps(resolveProjectRoot());
  const errorHandler = new ErrorHandler(output);
  for (;;) {
    try {
      const result = await new InteractiveMenuUseCase(manifestRepo, prompter).execute();
      if (result.command[0] === "exit") process.exit(0);
      const exitCode = await spawnCliCommand(result.command);
      await waitForEnter();
      if (exitCode !== 0 && result.command[0] === "setup") process.exit(exitCode);
    } catch (error) {
      routeMenuError(error, errorHandler);
    }
  }
}
