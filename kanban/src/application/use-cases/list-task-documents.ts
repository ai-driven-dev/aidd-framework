import { type Board, deriveBoard } from "../../domain/models/board.js";
import { UNKNOWN_DOCUMENT_STATUS } from "../../domain/models/document-status.js";
import type { ProgressStatus } from "../../domain/models/progress-status.js";
import { groupTaskDocumentsByDirectory, type TaskGroup } from "../../domain/models/task-group.js";
import type { TaskDocumentRepository } from "../../domain/ports/task-document-repository.js";

export interface ListTaskDocumentsFilters {
  type?: string;
  status?: string;
  progress?: ProgressStatus;
  shouldIncludeUnknownStatus?: boolean;
}

function matchesFilters(taskGroup: TaskGroup, filters: ListTaskDocumentsFilters): boolean {
  const parent = taskGroup.parent;
  const matchesType = filters.type === undefined || parent.type === filters.type;
  const matchesStatus = filters.status === undefined || parent.status === filters.status;
  const matchesProgress =
    filters.progress === undefined || parent.progressStatus === filters.progress;
  const matchesUnknownStatusVisibility =
    filters.shouldIncludeUnknownStatus === true || parent.status !== UNKNOWN_DOCUMENT_STATUS;

  return matchesType && matchesStatus && matchesProgress && matchesUnknownStatusVisibility;
}

export class ListTaskDocumentsUseCase {
  constructor(private readonly taskDocumentRepository: TaskDocumentRepository) {}

  async execute(projectPath: string, filters: ListTaskDocumentsFilters): Promise<Board> {
    const taskDocuments = await this.taskDocumentRepository.findAll(projectPath);
    const taskGroups = groupTaskDocumentsByDirectory(taskDocuments);
    const matchingTaskGroups = taskGroups.filter((taskGroup) => matchesFilters(taskGroup, filters));

    return deriveBoard(matchingTaskGroups);
  }
}
