import { exec } from "node:child_process";
import { platform } from "node:os";
import type { Command } from "commander";
import { ListTaskDocumentsUseCase } from "../../application/use-cases/list-task-documents.js";
import { FilesystemTaskDocumentRepository } from "../../infrastructure/filesystem/filesystem-task-document-repository.js";
import { FilesystemTaskDocumentWatcher } from "../../infrastructure/filesystem/filesystem-task-document-watcher.js";
import type { KanbanCommandDeps } from "../kanban-deps.js";
import {
  FRONTEND_APP_JS,
  FRONTEND_INDEX_HTML,
  FRONTEND_STYLES_CSS,
} from "../web/frontend-assets.js";
import { KanbanWebServer } from "../web/http-server.js";

const DEFAULT_PORT = 3000;

interface WebCommandOptions {
  port?: string;
}

function openBrowser(url: string): void {
  const os = platform();
  const command =
    os === "darwin" ? `open ${url}` : os === "win32" ? `start ${url}` : `xdg-open ${url}`;

  exec(command);
}

function runWebCommand(path: string, options: WebCommandOptions, deps: KanbanCommandDeps): void {
  const port = options.port !== undefined ? Number.parseInt(options.port, 10) : DEFAULT_PORT;
  const repository = new FilesystemTaskDocumentRepository(deps.docsDirectoryName);
  const useCase = new ListTaskDocumentsUseCase(repository);
  const watcher = new FilesystemTaskDocumentWatcher(deps.docsDirectoryName);

  const server = new KanbanWebServer({
    port,
    projectPath: path,
    useCase,
    filters: {},
    watcher,
    output: deps.output,
    indexHtml: FRONTEND_INDEX_HTML,
    stylesCss: FRONTEND_STYLES_CSS,
    appJs: FRONTEND_APP_JS,
  });

  server.start().then((actualPort) => {
    openBrowser(`http://localhost:${actualPort}`);
  });

  process.on("SIGINT", () => {
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });
}

export function registerWebCommand(program: Command, deps: KanbanCommandDeps): void {
  program
    .argument("[path]", "project path", process.cwd())
    .option("--port <port>", "server port", String(DEFAULT_PORT))
    .action((path: string, options: WebCommandOptions) => {
      try {
        runWebCommand(path, options, deps);
      } catch (error) {
        deps.onError(error);
      }
    });
}
