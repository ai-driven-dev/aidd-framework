import { createServer, type Server, type ServerResponse } from "node:http";
import type { TaskDocumentWatcher } from "../../domain/ports/task-document-watcher.js";
import type { BoardDto } from "../../presentation/dto/board-dto.js";
import { SseManager } from "./sse-manager.js";

export interface WebServerOutput {
  print(message: string): void;
}

export interface KanbanWebServerDeps {
  port: number;
  projectPath: string;
  boardProvider: () => Promise<BoardDto>;
  watcher: TaskDocumentWatcher;
  output: WebServerOutput;
  indexHtml: string;
  stylesCss: string;
  appJs: string;
}

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
};

function serveText(res: ServerResponse, contentType: string, body: string): void {
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function serveNotFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": CONTENT_TYPES.json });
  res.end(JSON.stringify({ error: "not found" }));
}

export class KanbanWebServer {
  private server: Server | undefined;
  private readonly sseManager = new SseManager();
  private readonly deps: KanbanWebServerDeps;

  constructor(deps: KanbanWebServerDeps) {
    this.deps = deps;
  }

  async start(): Promise<number> {
    this.deps.watcher.onChange(() => {
      this.fetchAndBroadcast();
    });

    this.server = createServer(async (req, res) => {
      await this.handleRequest(req.url ?? "/", res);
    });

    this.deps.watcher.start(this.deps.projectPath);

    const server = this.server;

    return new Promise((resolve) => {
      server.listen(this.deps.port, () => {
        const address = server.address();
        const actualPort =
          typeof address === "object" && address !== null ? address.port : this.deps.port;
        this.deps.output.print(`Kanban board at http://localhost:${actualPort}`);
        resolve(actualPort);
      });
    });
  }

  stop(): void {
    this.deps.watcher.stop();
    this.sseManager.closeAll();

    if (this.server !== undefined) {
      this.server.close();
      this.server = undefined;
    }
  }

  private async handleRequest(url: string, res: ServerResponse): Promise<void> {
    const path = url.split("?")[0];

    switch (path) {
      case "/":
        serveText(res, CONTENT_TYPES.html, this.deps.indexHtml);
        return;
      case "/styles.css":
        serveText(res, CONTENT_TYPES.css, this.deps.stylesCss);
        return;
      case "/app.js":
        serveText(res, CONTENT_TYPES.js, this.deps.appJs);
        return;
      case "/api/tasks":
        await this.handleApiTasks(res);
        return;
      case "/events":
        this.sseManager.addClient(res);
        return;
      default:
        serveNotFound(res);
    }
  }

  private async handleApiTasks(res: ServerResponse): Promise<void> {
    try {
      const board = await this.deps.boardProvider();
      serveText(res, CONTENT_TYPES.json, JSON.stringify(board));
    } catch {
      res.writeHead(500, { "Content-Type": CONTENT_TYPES.json });
      res.end(JSON.stringify({ error: "failed to scan task documents" }));
    }
  }

  private fetchAndBroadcast(): void {
    this.deps
      .boardProvider()
      .then((board) => this.sseManager.broadcast(board))
      .catch(() => {});
  }
}
