import { ListTaskDocumentsUseCase } from "../application/use-cases/list-task-documents.js";
import type { TaskDocumentWatcher } from "../domain/ports/task-document-watcher.js";
import { FilesystemTaskDocumentRepository } from "../infrastructure/filesystem/filesystem-task-document-repository.js";
import { FilesystemTaskDocumentWatcher } from "../infrastructure/filesystem/filesystem-task-document-watcher.js";
import { readFrontendAssets } from "../infrastructure/http/frontend-assets.js";
import { KanbanWebServer } from "../infrastructure/http/kanban-web-server.js";
import { toBoardDto } from "../presentation/dto/board-dto.js";
import type { KanbanCommandDeps, KanbanOutput } from "../presentation/kanban-deps.js";

export interface CreateKanbanRuntimeInput {
  deps: KanbanCommandDeps;
  projectPath: string;
}

export interface KanbanRuntime {
  listTaskDocuments: ListTaskDocumentsUseCase;
  createWatcher: () => TaskDocumentWatcher;
  createWebServer: (port: number) => KanbanWebServer;
  output: KanbanOutput;
  projectPath: string;
}

export function createKanbanRuntime({
  deps,
  projectPath,
}: CreateKanbanRuntimeInput): KanbanRuntime {
  const repository = new FilesystemTaskDocumentRepository(deps.docsDirectoryName);
  const listTaskDocuments = new ListTaskDocumentsUseCase(repository);
  const createWatcher = () => new FilesystemTaskDocumentWatcher(deps.docsDirectoryName);

  return {
    listTaskDocuments,
    createWatcher,
    createWebServer: (port: number) =>
      new KanbanWebServer({
        port,
        projectPath,
        boardProvider: async () => toBoardDto(await listTaskDocuments.execute(projectPath, {})),
        watcher: createWatcher(),
        output: deps.output,
        ...readFrontendAssets(),
      }),
    output: deps.output,
    projectPath,
  };
}
