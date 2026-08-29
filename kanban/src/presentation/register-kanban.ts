import type { Command } from "commander";
import { createKanbanRuntime } from "../composition/kanban-runtime.js";
import { registerInteractiveCommand } from "./commands/interactive-command.js";
import { registerListCommand } from "./commands/list-command.js";
import { registerWebCommand } from "./commands/web-command.js";
import type { KanbanCommandDeps } from "./kanban-deps.js";

export function registerKanban(program: Command, deps: KanbanCommandDeps): void {
  const runtime = createKanbanRuntime({ deps, projectPath: process.cwd() });

  registerListCommand(program, runtime, deps.onError);
  registerInteractiveCommand(program.command("interactive", { isDefault: true }), deps);
  registerWebCommand(program.command("web"), runtime, deps.onError);
}
