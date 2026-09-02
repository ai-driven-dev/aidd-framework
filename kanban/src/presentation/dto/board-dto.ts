import type { Board } from "../../domain/models/board.js";
import { PROGRESS_STATUS_DONE, type ProgressStatus } from "../../domain/models/progress-status.js";
import type { TaskDocument } from "../../domain/models/task-document.js";
import type { TaskGroup } from "../../domain/models/task-group.js";

export interface BoardSubCardDto {
  name: string;
  status: string;
  progressStatus: ProgressStatus;
  path: string;
}

export interface BoardCardDto {
  name: string;
  status: string;
  type: string;
  progressStatus: ProgressStatus;
  description: string;
  path: string;
  subDocuments: BoardSubCardDto[];
  doneSubCount: number;
  totalSubCount: number;
}

export interface BoardColumnDto {
  progressStatus: ProgressStatus;
  label: string;
  cards: BoardCardDto[];
}

export interface BoardDto {
  columns: BoardColumnDto[];
}

function toSubCardDto(subDocument: TaskDocument): BoardSubCardDto {
  return {
    name: subDocument.name,
    status: subDocument.status,
    progressStatus: subDocument.progressStatus,
    path: subDocument.filePath,
  };
}

function countDoneSubCards(subCards: BoardSubCardDto[]): number {
  return subCards.filter((subCard) => subCard.progressStatus === PROGRESS_STATUS_DONE).length;
}

function toCardDto(taskGroup: TaskGroup): BoardCardDto {
  const subDocuments = taskGroup.subDocuments.map(toSubCardDto);

  return {
    name: taskGroup.parent.name,
    status: taskGroup.parent.status,
    type: taskGroup.parent.type,
    progressStatus: taskGroup.parent.progressStatus,
    description: taskGroup.parent.description,
    path: taskGroup.parent.filePath,
    subDocuments,
    doneSubCount: countDoneSubCards(subDocuments),
    totalSubCount: subDocuments.length,
  };
}

export function toBoardDto(board: Board): BoardDto {
  return {
    columns: board.columns.map((column) => ({
      progressStatus: column.progressStatus,
      label: column.label,
      cards: column.taskGroups.map(toCardDto),
    })),
  };
}
