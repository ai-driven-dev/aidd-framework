import { type Command, Option } from "commander";
import { PROGRESS_STATUSES_IN_COLUMN_ORDER } from "../../domain/models/progress-status.js";
import type { KanbanCommandDeps } from "../kanban-deps.js";
import { toProgressStatusFilter } from "./progress-status-filter.js";

interface InteractiveCommandOptions {
  type?: string;
  status?: string;
  progress?: string;
  all?: boolean;
}

/**
 * The renderer and the view load when the command runs, not when it registers.
 *
 * `ink` and `react` are a megabyte and a half of text-interface machinery, and the CLI
 * that hosts this command must be able to register it without paying for them: it needs
 * the subcommand declared at parse time, but the renderer only once someone asks for the
 * interactive view. Importing them at the top of this module makes every invocation of
 * that CLI load them.
 */
async function runInteractiveCommand(
  path: string,
  options: InteractiveCommandOptions,
  deps: KanbanCommandDeps
): Promise<void> {
  const [{ render }, { createElement }, { StatusColumnsView }] = await Promise.all([
    import("ink"),
    import("react"),
    import("../components/status-columns-view.js"),
  ]);
  render(
    createElement(StatusColumnsView, {
      projectPath: path,
      docsDirectoryName: deps.docsDirectoryName,
      filters: {
        type: options.type,
        status: options.status,
        progress: toProgressStatusFilter(options.progress),
        shouldIncludeUnknownStatus: options.all,
      },
    })
  );
}

export function registerInteractiveCommand(program: Command, deps: KanbanCommandDeps): void {
  program
    .argument("[path]", "project path", process.cwd())
    .option("--type <type>", "filter by document type")
    .option("--status <status>", "filter by document status")
    .addOption(
      new Option("--progress <progress>", "filter by normalized progress status").choices(
        PROGRESS_STATUSES_IN_COLUMN_ORDER
      )
    )
    .option("--all", "include task groups whose parent has no known status")
    .action(async (path: string, options: InteractiveCommandOptions) => {
      try {
        await runInteractiveCommand(path, options, deps);
      } catch (error) {
        deps.onError(error);
      }
    });
}
