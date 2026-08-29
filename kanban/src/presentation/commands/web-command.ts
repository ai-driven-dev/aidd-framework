import { exec } from "node:child_process";
import { platform } from "node:os";
import type { Command } from "commander";
import type { KanbanRuntime } from "../../composition/kanban-runtime.js";

const DEFAULT_PORT = 3000;
const PORT_RADIX = 10;

interface WebCommandOptions {
  port?: string;
}

class InvalidPortError extends Error {
  constructor(rawPort: string) {
    super(`KANBAN_INVALID_PORT: "${rawPort}" is not a valid port number`);
    this.name = "InvalidPortError";
  }
}

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number.parseInt(rawPort, PORT_RADIX);

  if (Number.isNaN(port)) {
    throw new InvalidPortError(rawPort);
  }

  return port;
}

function openBrowser(url: string): void {
  const os = platform();
  const command =
    os === "darwin" ? `open ${url}` : os === "win32" ? `start ${url}` : `xdg-open ${url}`;

  exec(command);
}

async function runWebCommand(options: WebCommandOptions, runtime: KanbanRuntime): Promise<void> {
  const port = parsePort(options.port);
  const server = runtime.createWebServer(port);
  const actualPort = await server.start();

  openBrowser(`http://localhost:${actualPort}`);

  const stopServer = (): void => {
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", stopServer);
  process.on("SIGTERM", stopServer);
}

export function registerWebCommand(
  program: Command,
  runtime: KanbanRuntime,
  onError: (error: unknown) => void
): void {
  program
    .option("--port <port>", "server port", String(DEFAULT_PORT))
    .action(async (options: WebCommandOptions) => {
      try {
        await runWebCommand(options, runtime);
      } catch (error) {
        onError(error);
      }
    });
}
