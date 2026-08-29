import type { Command } from "commander";
import { type KanbanCommandDeps, registerKanban } from "../../../../kanban/src/index.js";
import { DOCS_DIR } from "../../domain/models/paths.js";
import { ErrorHandler } from "../error-handler.js";
import type { CLIOutput } from "../output.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerKanbanCommand(program: Command): void {
  // Hidden on purpose: the command runs, but it is not ready to be offered to users and
  // must not appear in `aidd --help`. Unhide once its product direction is settled.
  const kanban = program
    .command("kanban", { hidden: true })
    .description("Experimental. View the project's task documents as status columns");

  // Resolved per action, not at registration: `--verbose` is only parsed once
  // `program.parse()` has run, long after this function returns.
  const resolveOutput = (): CLIOutput => parseGlobalOptions(program).output;

  const deps: KanbanCommandDeps = {
    docsDirectoryName: DOCS_DIR,
    output: { print: (message: string) => resolveOutput().print(message) },
    onError: (error) => new ErrorHandler(resolveOutput()).handle(error),
  };

  registerKanban(kanban, deps);
}
