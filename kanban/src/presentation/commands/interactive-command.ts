import { type Command, Option } from "commander";
import { render } from "ink";
import { createElement } from "react";
import type { KanbanRuntime } from "../../composition/kanban-runtime.js";
import { PROGRESS_STATUSES_IN_COLUMN_ORDER } from "../../domain/models/progress-status.js";
import { StatusColumnsView } from "../components/status-columns-view.js";
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
  runtime: KanbanRuntime
): void {
  render(
    createElement(StatusColumnsView, {
      listTaskDocuments: runtime.listTaskDocuments,
      projectPath: path,
      filters: {
        type: options.type,
        status: options.status,
        progress: toProgressStatusFilter(options.progress),
        shouldIncludeUnknownStatus: options.all,
      },
    })
  );
}

export function registerInteractiveCommand(
  program: Command,
  runtime: KanbanRuntime,
  onError: (error: unknown) => void
): void {
  program
    .argument("[path]", "project path", runtime.projectPath)
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
        runInteractiveCommand(path, options, runtime);
      } catch (error) {
        onError(error);
      }
    });
}
