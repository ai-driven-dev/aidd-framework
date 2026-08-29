import { ListTaskDocumentsUseCase } from "../application/use-cases/list-task-documents.js";
import type { TaskDocumentWatcher } from "../domain/ports/task-document-watcher.js";
import { FilesystemTaskDocumentRepository } from "../infrastructure/filesystem/filesystem-task-document-repository.js";
import { FilesystemTaskDocumentWatcher } from "../infrastructure/filesystem/filesystem-task-document-watcher.js";
import type { KanbanCommandDeps, KanbanOutput } from "../presentation/kanban-deps.js";

export interface CreateKanbanRuntimeInput {
  deps: KanbanCommandDeps;
  projectPath: string;
}

export interface KanbanRuntime {
  listTaskDocuments: ListTaskDocumentsUseCase;
  createWatcher: () => TaskDocumentWatcher;
  output: KanbanOutput;
  projectPath: string;
}

export function createKanbanRuntime({
  deps,
  projectPath,
}: CreateKanbanRuntimeInput): KanbanRuntime {
  const repository = new FilesystemTaskDocumentRepository(deps.docsDirectoryName);

  return {
    listTaskDocuments: new ListTaskDocumentsUseCase(repository),
    createWatcher: () => new FilesystemTaskDocumentWatcher(deps.docsDirectoryName),
    output: deps.output,
    projectPath,
  };
}
