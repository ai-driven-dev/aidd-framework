import {
  PROGRESS_STATUS_BLOCKED,
  PROGRESS_STATUS_DONE,
  PROGRESS_STATUS_IN_PROGRESS,
  PROGRESS_STATUS_TODO,
  PROGRESS_STATUS_UNKNOWN,
  PROGRESS_STATUSES_IN_COLUMN_ORDER,
  type ProgressStatus,
} from "./progress-status.js";
import type { TaskGroup } from "./task-group.js";

export interface BoardColumn {
  progressStatus: ProgressStatus;
  label: string;
  taskGroups: TaskGroup[];
}

export interface Board {
  columns: BoardColumn[];
}

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  [PROGRESS_STATUS_TODO]: "TODO",
  [PROGRESS_STATUS_IN_PROGRESS]: "IN PROGRESS",
  [PROGRESS_STATUS_DONE]: "DONE",
  [PROGRESS_STATUS_BLOCKED]: "BLOCKED",
  [PROGRESS_STATUS_UNKNOWN]: "UNKNOWN",
};

function collectTaskGroupsForColumn(
  taskGroups: TaskGroup[],
  progressStatus: ProgressStatus
): TaskGroup[] {
  return taskGroups.filter((taskGroup) => taskGroup.parent.progressStatus === progressStatus);
}

export function deriveBoard(taskGroups: TaskGroup[]): Board {
  const columns = PROGRESS_STATUSES_IN_COLUMN_ORDER.map((progressStatus) => ({
    progressStatus,
    label: PROGRESS_STATUS_LABELS[progressStatus],
    taskGroups: collectTaskGroupsForColumn(taskGroups, progressStatus),
  }));

  return {
    columns: columns.filter(
      (column) => column.progressStatus !== PROGRESS_STATUS_UNKNOWN || column.taskGroups.length > 0
    ),
  };
}
