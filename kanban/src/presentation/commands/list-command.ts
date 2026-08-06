import Table from "cli-table3";
import { type Command, Option } from "commander";
import { ListTaskDocumentsUseCase } from "../../application/use-cases/list-task-documents.js";
import { PROGRESS_STATUSES_IN_COLUMN_ORDER } from "../../domain/models/progress-status.js";
import type { TaskGroup } from "../../domain/models/task-group.js";
import { FilesystemTaskDocumentRepository } from "../../infrastructure/filesystem/filesystem-task-document-repository.js";
import type { KanbanCommandDeps } from "../kanban-deps.js";
import {
  collectDistinctParentStatuses,
  groupTaskGroupsByParentStatus,
} from "../status-grouping.js";
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

function computeVisibleColumnCount(terminalWidth: number, totalColumnCount: number): number {
  if (totalColumnCount === 0) {
    return 0;
  }

  const maxColumnsThatFit = Math.max(1, Math.floor(terminalWidth / MINIMUM_COLUMN_WIDTH));
  return Math.min(totalColumnCount, maxColumnsThatFit);
}

function computeColumnWidths(terminalWidth: number, columnCount: number): number[] {
  const columnWidth = Math.max(MINIMUM_COLUMN_WIDTH, Math.floor(terminalWidth / columnCount));

  return new Array(columnCount).fill(columnWidth);
}

function formatHiddenColumnsNotice(hiddenColumnCount: number): string {
  return `\n${hiddenColumnCount} status column(s) not shown; widen the terminal to see them.`;
}

function buildStatusColumnTable(taskGroups: TaskGroup[]): string {
  const statuses = collectDistinctParentStatuses(taskGroups);

  if (statuses.length === 0) {
    return "No task documents found.";
  }

  const terminalWidth = resolveTerminalWidth();
  const visibleColumnCount = computeVisibleColumnCount(terminalWidth, statuses.length);
  const visibleStatuses = statuses.slice(0, visibleColumnCount);
  const taskGroupsByStatus = groupTaskGroupsByParentStatus(taskGroups, visibleStatuses);
  const rowCount = Math.max(
    ...visibleStatuses.map((status) => taskGroupsByStatus.get(status)?.length ?? 0)
  );

  const table = new Table({
    head: visibleStatuses,
    colWidths: computeColumnWidths(terminalWidth, visibleStatuses.length),
    wordWrap: true,
  });

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    table.push(
      visibleStatuses.map((status) => {
        const taskGroup = taskGroupsByStatus.get(status)?.[rowIndex];
        return taskGroup === undefined ? "" : formatTaskGroupCell(taskGroup);
      })
    );
  }

  const hiddenColumnCount = statuses.length - visibleStatuses.length;
  return hiddenColumnCount > 0
    ? table.toString() + formatHiddenColumnsNotice(hiddenColumnCount)
    : table.toString();
}

async function runListCommand(
  path: string,
  options: ListCommandOptions,
  deps: KanbanCommandDeps
): Promise<void> {
  const taskDocumentRepository = new FilesystemTaskDocumentRepository(deps.docsDirectoryName);
  const listTaskDocumentsUseCase = new ListTaskDocumentsUseCase(taskDocumentRepository);

  const taskGroups = await listTaskDocumentsUseCase.execute(path, {
    type: options.type,
    status: options.status,
    progress: toProgressStatusFilter(options.progress),
    shouldIncludeUnknownStatus: options.all,
  });

  if (options.json === true) {
    deps.output.print(JSON.stringify(taskGroups, null, 2));
    return;
  }

  deps.output.print(buildStatusColumnTable(taskGroups));
}

export function registerListCommand(program: Command, deps: KanbanCommandDeps): void {
  program
    .command("list")
    .argument("[path]", "project path", process.cwd())
    .option("--type <type>", "filter by document type")
    .option("--status <status>", "filter by document status")
    .addOption(
      new Option("--progress <progress>", "filter by normalized progress status").choices(
        PROGRESS_STATUSES_IN_COLUMN_ORDER
      )
    )
    .option("--all", "include task groups whose parent has no known status")
    .option("--json", "print the task groups as JSON instead of a table")
    .action(async (path: string, options: ListCommandOptions) => {
      try {
        await runListCommand(path, options, deps);
      } catch (error) {
        deps.onError(error);
      }
    });
}
