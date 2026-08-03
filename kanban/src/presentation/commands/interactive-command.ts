import { type Command, Option } from "commander";
import { render } from "ink";
import { createElement } from "react";
import { PROGRESS_STATUSES_IN_COLUMN_ORDER } from "../../domain/models/progress-status.js";
import { StatusColumnsView } from "../components/status-columns-view.js";
import type { KanbanCommandDeps } from "../kanban-deps.js";
import { toProgressStatusFilter } from "./progress-status-filter.js";

interface InteractiveCommandOptions {
  type?: string;
  status?: string;
  progress?: string;
  all?: boolean;
}

function runInteractiveCommand(
  path: string,
  options: InteractiveCommandOptions,
  deps: KanbanCommandDeps
): void {
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
    .action((path: string, options: InteractiveCommandOptions) => {
      try {
        runInteractiveCommand(path, options, deps);
      } catch (error) {
        deps.onError(error);
      }
    });
}
