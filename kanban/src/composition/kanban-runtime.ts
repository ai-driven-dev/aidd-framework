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

export interface WebServerTarget {
  projectPath: string;
  pinned: boolean;
}

export interface KanbanRuntime {
  listTaskDocuments: ListTaskDocumentsUseCase;
  createWatcher: () => TaskDocumentWatcher;
  createWebServer: (port: number, target: WebServerTarget) => KanbanWebServer;
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
    createWebServer: (port: number, target: WebServerTarget) =>
      new KanbanWebServer({
        port,
        projectPath: target.projectPath,
        pinned: target.pinned,
        boardProvider: async (targetPath: string) =>
          toBoardDto(await listTaskDocuments.execute(targetPath, {})),
        projectValidator: (targetPath: string) => repository.projectExists(targetPath),
        watcher: createWatcher(),
        output: deps.output,
        ...readFrontendAssets(),
      }),
    output: deps.output,
    projectPath,
  };
}
