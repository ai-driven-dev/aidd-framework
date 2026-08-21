import { afterEach, describe, expect, it, vi } from "vitest";
import { ListTaskDocumentsUseCase } from "../../src/application/use-cases/list-task-documents.js";
import type { TaskDocument } from "../../src/domain/models/task-document.js";
import type { TaskDocumentRepository } from "../../src/domain/ports/task-document-repository.js";
import type { TaskDocumentWatcher } from "../../src/domain/ports/task-document-watcher.js";
import { KanbanWebServer } from "../../src/presentation/web/http-server.js";

const MOCK_DOCUMENT: TaskDocument = {
  name: "test-plan",
  description: "a test plan",
  type: "plan",
  status: "pending",
  progressStatus: "todo",
  filePath: "/tmp/test/aidd_docs/tasks/plan.md",
};

function createMockRepository(documents: TaskDocument[] = [MOCK_DOCUMENT]): TaskDocumentRepository {
  return {
    findAll: vi.fn().mockResolvedValue(documents),
  };
}

function createMockWatcher(): TaskDocumentWatcher & { triggerChange: () => void } {
  let callback: (() => void) | undefined;

  return {
    start: vi.fn(),
    stop: vi.fn(),
    onChange: vi.fn().mockImplementation((cb) => {
      callback = cb;
    }),
    triggerChange() {
      callback?.();
    },
  };
}

function createServer(
  overrides: Partial<{
    repository: TaskDocumentRepository;
    watcher: ReturnType<typeof createMockWatcher>;
  }> = {}
): {
  server: KanbanWebServer;
  watcher: ReturnType<typeof createMockWatcher>;
  output: { messages: string[]; print: (msg: string) => void };
} {
  const watcher = overrides.watcher ?? createMockWatcher();
  const repository = overrides.repository ?? createMockRepository();
  const output = {
    messages: [] as string[],
    print(msg: string) {
      output.messages.push(msg);
    },
  };

  const server = new KanbanWebServer({
    port: 0,
    projectPath: "/tmp/test",
    useCase: new ListTaskDocumentsUseCase(repository),
    filters: {},
    watcher,
    output,
    indexHtml: "<html><body>kanban</body></html>",
    stylesCss: "body { margin: 0; }",
    appJs: "console.log('kanban');",
  });

  return { server, watcher, output };
}

async function fetchFromServer(port: number, path: string): Promise<Response> {
  return fetch(`http://localhost:${port}${path}`);
}

describe("KanbanWebServer", () => {
  let server: KanbanWebServer;
  let port: number;

  afterEach(() => {
    server?.stop();
  });

  it("serves index.html on GET /", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("kanban");
  });

  it("serves styles.css on GET /styles.css", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/styles.css");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/css");
  });

  it("serves app.js on GET /app.js", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/app.js");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/javascript");
  });

  it("returns task groups as JSON on GET /api/tasks", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/api/tasks");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as Array<{ parent: { name: string } }>;
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body[0]?.parent.name).toBe("test-plan");
  });

  it("opens an SSE connection on GET /events", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/events");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    res.body?.cancel();
  });

  it("returns 404 for unknown paths", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/unknown");

    expect(res.status).toBe(404);
  });

  it("prints the server URL on start", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    expect(ctx.output.messages.length).toBe(1);
    expect(ctx.output.messages[0]).toContain(`http://localhost:${port}`);
  });

  it("starts the watcher on start", async () => {
    const ctx = createServer();
    server = ctx.server;
    await server.start();

    expect(ctx.watcher.start).toHaveBeenCalledWith("/tmp/test");
  });

  it("stops the watcher on stop", async () => {
    const ctx = createServer();
    server = ctx.server;
    await server.start();
    server.stop();

    expect(ctx.watcher.stop).toHaveBeenCalled();
  });
});
