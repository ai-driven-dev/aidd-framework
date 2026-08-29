import Table from "cli-table3";
import { type Command, Option } from "commander";
import type { KanbanRuntime } from "../../composition/kanban-runtime.js";
import type { Board } from "../../domain/models/board.js";
import { PROGRESS_STATUSES_IN_COLUMN_ORDER } from "../../domain/models/progress-status.js";
import type { TaskGroup } from "../../domain/models/task-group.js";
import { toProgressStatusFilter } from "./progress-status-filter.js";

const FALLBACK_TERMINAL_WIDTH = 120;
const MINIMUM_COLUMN_WIDTH = 20;

interface ListCommandOptions {
  type?: string;
  status?: string;
  progress?: string;
  all?: boolean;
  json?: boolean;
}

function formatTaskGroupCell(taskGroup: TaskGroup): string {
  const subDocumentLines = taskGroup.subDocuments.map(
    (subDocument) => `- ${subDocument.name}: ${subDocument.status}`
  );

  return [taskGroup.parent.name, ...subDocumentLines].join("\n");
}

function resolveTerminalWidth(): number {
  return process.stdout.columns ?? FALLBACK_TERMINAL_WIDTH;
}

function computeColumnWidths(terminalWidth: number, columnCount: number): number[] {
  const columnWidth = Math.max(MINIMUM_COLUMN_WIDTH, Math.floor(terminalWidth / columnCount));

  return new Array(columnCount).fill(columnWidth);
}

function buildStatusColumnTable(board: Board): string {
  const hasAnyTaskGroup = board.columns.some((column) => column.taskGroups.length > 0);

  if (!hasAnyTaskGroup) {
    return "No task documents found.";
  }

  const terminalWidth = resolveTerminalWidth();
  const rowCount = Math.max(...board.columns.map((column) => column.taskGroups.length));

  const table = new Table({
    head: board.columns.map((column) => column.label),
    colWidths: computeColumnWidths(terminalWidth, board.columns.length),
    wordWrap: true,
    wrapOnWordBoundary: false,
  });

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    table.push(
      board.columns.map((column) => {
        const taskGroup = column.taskGroups[rowIndex];
        return taskGroup === undefined ? "" : formatTaskGroupCell(taskGroup);
      })
    );
  }

  return table.toString();
}

async function runListCommand(
  path: string,
  options: ListCommandOptions,
  runtime: KanbanRuntime
): Promise<void> {
  const board = await runtime.listTaskDocuments.execute(path, {
    type: options.type,
    status: options.status,
    progress: toProgressStatusFilter(options.progress),
    shouldIncludeUnknownStatus: options.all,
  });

  if (options.json === true) {
    runtime.output.print(JSON.stringify(board, null, 2));
    return;
  }

  runtime.output.print(buildStatusColumnTable(board));
}

export function registerListCommand(
  program: Command,
  runtime: KanbanRuntime,
  onError: (error: unknown) => void
): void {
  program
    .command("list")
    .argument("[path]", "project path", runtime.projectPath)
    .option("--type <type>", "filter by document type")
    .option("--status <status>", "filter by document status")
    .addOption(
      new Option("--progress <progress>", "filter by normalized progress status").choices(
        PROGRESS_STATUSES_IN_COLUMN_ORDER
      )
    )
    .option("--all", "include task groups whose parent has no known status")
    .option("--json", "print the board as JSON instead of a table")
    .action(async (path: string, options: ListCommandOptions) => {
      try {
        await runListCommand(path, options, runtime);
      } catch (error) {
        onError(error);
      }
    });
}
