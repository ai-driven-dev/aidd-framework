import type { ServerResponse } from "node:http";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
  "Access-Control-Allow-Origin": "*",
} as const;

export class SseManager {
  private readonly clients: Set<ServerResponse> = new Set();

  addClient(res: ServerResponse): void {
    res.writeHead(200, SSE_HEADERS);
    res.write("\n");

    this.clients.add(res);

    res.on("close", () => {
      this.clients.delete(res);
    });
  }

  broadcast(data: unknown): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;

    for (const client of this.clients) {
      client.write(payload);
    }
  }

  closeAll(): void {
    for (const client of this.clients) {
      client.end();
    }

    this.clients.clear();
  }

  get clientCount(): number {
    return this.clients.size;
  }
}
