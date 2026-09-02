import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskDocumentWatcher } from "../../../src/domain/ports/task-document-watcher.js";
import { KanbanWebServer } from "../../../src/infrastructure/http/kanban-web-server.js";
import type { BoardDto } from "../../../src/presentation/dto/board-dto.js";

const SAMPLE_BOARD_DTO: BoardDto = {
  columns: [
    {
      progressStatus: "todo",
      label: "TODO",
      cards: [
        {
          name: "test-plan",
          status: "pending",
          type: "plan",
          progressStatus: "todo",
          description: "a test plan",
          path: "aidd_docs/tasks/plan.md",
          subDocuments: [],
          doneSubCount: 0,
          totalSubCount: 0,
        },
      ],
    },
  ],
};

function createMockWatcher(): TaskDocumentWatcher & { triggerChange: () => void } {
  let callback: (() => void) | undefined;

  return {
    start: vi.fn(),
    retarget: vi.fn(),
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
    boardProvider: (projectPath: string) => Promise<BoardDto>;
    projectValidator: (projectPath: string) => Promise<boolean>;
    watcher: ReturnType<typeof createMockWatcher>;
    pinned: boolean;
  }> = {}
): {
  server: KanbanWebServer;
  watcher: ReturnType<typeof createMockWatcher>;
  output: { messages: string[]; print: (msg: string) => void };
} {
  const watcher = overrides.watcher ?? createMockWatcher();
  const boardProvider = overrides.boardProvider ?? (async () => SAMPLE_BOARD_DTO);
  const projectValidator = overrides.projectValidator ?? (async () => true);
  const output = {
    messages: [] as string[],
    print(msg: string) {
      output.messages.push(msg);
    },
  };

  const server = new KanbanWebServer({
    port: 0,
    projectPath: "/tmp/test",
    pinned: overrides.pinned ?? false,
    boardProvider,
    projectValidator,
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

async function readNextSseData(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      throw new Error("SSE stream closed before a data frame arrived");
    }
    buffer += decoder.decode(value, { stream: true });
    const match = buffer.match(/data: (.*)\n\n/);
    if (match?.[1] !== undefined) {
      await reader.cancel();
      return match[1];
    }
  }
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

  it("returns the board DTO as JSON on GET /api/tasks", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/api/tasks");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as BoardDto;
    const todoColumn = body.columns.find((column) => column.progressStatus === "todo");
    expect(todoColumn?.cards[0]?.name).toBe("test-plan");
    expect(todoColumn?.cards[0]?.totalSubCount).toBe(0);
  });

  it("responds 500 with a generic error body when the board provider throws", async () => {
    const ctx = createServer({
      boardProvider: async () => {
        throw new Error("scan failed");
      },
    });
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/api/tasks");

    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("failed to scan task documents");
    expect(JSON.stringify(body)).not.toContain("scan failed");
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

  it("reports the active path and the pin flag on GET /api/project", async () => {
    const ctx = createServer({ pinned: true });
    server = ctx.server;
    port = await server.start();

    const res = await fetchFromServer(port, "/api/project");
    const body = (await res.json()) as { path: string; pinned: boolean };

    expect(res.status).toBe(200);
    expect(body).toEqual({ path: "/tmp/test", pinned: true });
  });

  it("retargets the watcher and shifts the board when POST /api/project switches project", async () => {
    const boardByPath: Record<string, BoardDto> = {
      "/tmp/test": SAMPLE_BOARD_DTO,
      "/tmp/other": { columns: [{ progressStatus: "done", label: "DONE", cards: [] }] },
    };
    const ctx = createServer({
      boardProvider: async (projectPath) => boardByPath[projectPath] ?? SAMPLE_BOARD_DTO,
      projectValidator: async (projectPath) => projectPath === "/tmp/other",
    });
    server = ctx.server;
    port = await server.start();

    const events = await fetchFromServer(port, "/events");
    if (events.body === null) {
      throw new Error("SSE response had no body");
    }
    const nextEventData = readNextSseData(events.body);

    const res = await fetch(`http://localhost:${port}/api/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/other" }),
    });

    expect(res.status).toBe(200);
    expect((await res.json()) as { path: string; pinned: boolean }).toEqual({
      path: "/tmp/other",
      pinned: false,
    });
    expect(ctx.watcher.retarget).toHaveBeenCalledWith("/tmp/other");

    const broadcastPayload = JSON.parse(await nextEventData) as BoardDto;
    expect(broadcastPayload.columns[0]?.progressStatus).toBe("done");

    const tasks = (await (await fetchFromServer(port, "/api/tasks")).json()) as BoardDto;
    expect(tasks.columns[0]?.progressStatus).toBe("done");
  });

  it("rejects a POST to a non-project path with 400 and leaves the active path untouched", async () => {
    const ctx = createServer({ projectValidator: async () => false });
    server = ctx.server;
    port = await server.start();

    const res = await fetch(`http://localhost:${port}/api/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/not-a-project" }),
    });
    const body = (await res.json()) as { error: string; code: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe("KANBAN_PROJECT_NOT_FOUND");
    expect(ctx.watcher.retarget).not.toHaveBeenCalled();

    const project = (await (await fetchFromServer(port, "/api/project")).json()) as {
      path: string;
    };
    expect(project.path).toBe("/tmp/test");
  });

  it("rejects a POST with a missing or non-string path with 400 KANBAN_PROJECT_INVALID_REQUEST", async () => {
    const ctx = createServer();
    server = ctx.server;
    port = await server.start();

    const res = await fetch(`http://localhost:${port}/api/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: 42 }),
    });
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(400);
    expect(body.code).toBe("KANBAN_PROJECT_INVALID_REQUEST");
    expect(ctx.watcher.retarget).not.toHaveBeenCalled();
  });

  it("rejects a POST on a pinned server with 409 KANBAN_PROJECT_PINNED", async () => {
    const ctx = createServer({ pinned: true });
    server = ctx.server;
    port = await server.start();

    const res = await fetch(`http://localhost:${port}/api/project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp/other" }),
    });
    const body = (await res.json()) as { code: string };

    expect(res.status).toBe(409);
    expect(body.code).toBe("KANBAN_PROJECT_PINNED");
    expect(ctx.watcher.retarget).not.toHaveBeenCalled();
  });
});
