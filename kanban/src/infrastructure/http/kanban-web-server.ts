import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { TaskDocumentWatcher } from "../../domain/ports/task-document-watcher.js";
import type { BoardDto } from "../../presentation/dto/board-dto.js";
import { SseManager } from "./sse-manager.js";

export interface WebServerOutput {
  print(message: string): void;
}

export interface KanbanWebServerDeps {
  port: number;
  projectPath: string;
  pinned: boolean;
  boardProvider: (projectPath: string) => Promise<BoardDto>;
  projectValidator: (projectPath: string) => Promise<boolean>;
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

const PROJECT_PINNED_MESSAGE =
  "KANBAN_PROJECT_PINNED: the project path is fixed by the command line";
const PROJECT_INVALID_REQUEST_MESSAGE =
  'KANBAN_PROJECT_INVALID_REQUEST: request body must be a JSON object with a string "path"';
const PROJECT_NOT_FOUND_MESSAGE =
  "KANBAN_PROJECT_NOT_FOUND: no task documents directory at the given path";

function serveText(res: ServerResponse, contentType: string, body: string): void {
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function serveJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { "Content-Type": CONTENT_TYPES.json, "Cache-Control": "no-store" });
  res.end(JSON.stringify(payload));
}

function serveNotFound(res: ServerResponse): void {
  serveJson(res, 404, { error: "not found" });
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function parseProjectPath(rawBody: string): string | undefined {
  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    return undefined;
  }

  if (typeof body !== "object" || body === null || !("path" in body)) {
    return undefined;
  }

  const candidate = body.path;

  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

export class KanbanWebServer {
  private server: Server | undefined;
  private readonly sseManager = new SseManager();
  private readonly deps: KanbanWebServerDeps;
  private activeProjectPath: string;

  constructor(deps: KanbanWebServerDeps) {
    this.deps = deps;
    this.activeProjectPath = deps.projectPath;
  }

  async start(): Promise<number> {
    this.deps.watcher.onChange(() => {
      void this.fetchAndBroadcast();
    });

    this.server = createServer((req, res) => {
      void this.handleRequest(req, res);
    });

    this.deps.watcher.start(this.activeProjectPath);

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

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = (req.url ?? "/").split("?")[0];

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
      case "/api/project":
        await this.handleApiProject(req, res);
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
      const board = await this.deps.boardProvider(this.activeProjectPath);
      serveText(res, CONTENT_TYPES.json, JSON.stringify(board));
    } catch {
      serveJson(res, 500, { error: "failed to scan task documents" });
    }
  }

  private async handleApiProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "GET") {
      serveJson(res, 200, { path: this.activeProjectPath, pinned: this.deps.pinned });
      return;
    }

    if (req.method !== "POST") {
      serveNotFound(res);
      return;
    }

    if (this.deps.pinned) {
      serveJson(res, 409, { error: PROJECT_PINNED_MESSAGE, code: "KANBAN_PROJECT_PINNED" });
      return;
    }

    const requestedPath = parseProjectPath(await readRequestBody(req));

    if (requestedPath === undefined) {
      serveJson(res, 400, {
        error: PROJECT_INVALID_REQUEST_MESSAGE,
        code: "KANBAN_PROJECT_INVALID_REQUEST",
      });
      return;
    }

    if (!(await this.deps.projectValidator(requestedPath))) {
      serveJson(res, 400, {
        error: PROJECT_NOT_FOUND_MESSAGE,
        code: "KANBAN_PROJECT_NOT_FOUND",
      });
      return;
    }

    this.activeProjectPath = requestedPath;
    this.deps.watcher.retarget(requestedPath);
    await this.fetchAndBroadcast();

    serveJson(res, 200, { path: requestedPath, pinned: false });
  }

  private fetchAndBroadcast(): Promise<void> {
    return this.deps
      .boardProvider(this.activeProjectPath)
      .then((board) => this.sseManager.broadcast(board))
      .catch(() => {});
  }
}
