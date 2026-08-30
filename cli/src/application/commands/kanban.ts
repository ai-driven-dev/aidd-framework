import type { Command } from "commander";
import { type KanbanCommandDeps, registerKanban } from "../../../../kanban/src/index.js";
import { createKanbanCommandDeps } from "../../infrastructure/deps.js";

export function registerKanbanCommand(program: Command): void {
  // Hidden on purpose: the command runs, but it is not ready to be offered to users and
  // must not appear in `aidd --help`. Unhide once its product direction is settled.
  const kanban = program
    .command("kanban", { hidden: true })
    .description("Experimental. View the project's task documents as status columns");

  const deps: KanbanCommandDeps = createKanbanCommandDeps(program);

  registerKanban(kanban, deps);
}
