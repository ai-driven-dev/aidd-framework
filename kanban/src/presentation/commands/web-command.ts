import { exec } from "node:child_process";
import { platform } from "node:os";
import type { Command } from "commander";
import type { KanbanRuntime } from "../../composition/kanban-runtime.js";
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

function runWebCommand(path: string, options: WebCommandOptions, runtime: KanbanRuntime): void {
  const port = options.port !== undefined ? Number.parseInt(options.port, 10) : DEFAULT_PORT;

  const server = new KanbanWebServer({
    port,
    projectPath: path,
    useCase: runtime.listTaskDocuments,
    filters: {},
    watcher: runtime.createWatcher(),
    output: runtime.output,
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

export function registerWebCommand(
  program: Command,
  runtime: KanbanRuntime,
  onError: (error: unknown) => void
): void {
  program
    .argument("[path]", "project path", runtime.projectPath)
    .option("--port <port>", "server port", String(DEFAULT_PORT))
    .action((path: string, options: WebCommandOptions) => {
      try {
        runWebCommand(path, options, runtime);
      } catch (error) {
        onError(error);
      }
    });
}
