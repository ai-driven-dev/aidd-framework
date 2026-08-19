import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  ReceiveTelemetryUseCase,
  TelemetryOtlpPath,
} from "../../application/use-cases/telemetry/receive-telemetry-use-case.js";
import type { Logger } from "../../domain/ports/logger.js";

const OTLP_PATHS: ReadonlySet<string> = new Set(["/v1/logs", "/v1/metrics", "/v1/traces"]);
const EMPTY_JSON_OBJECT = "{}";
const LOOPBACK_HOST = "127.0.0.1";

// An OTLP batch of telemetry lines is kilobytes. A receiver that runs unattended for
// months must not grow a buffer on a body that never ends, so the cap is deliberate
// rather than inherited from Node's request timeout.
const MAX_BODY_BYTES = 8 * 1024 * 1024;

/** Distinguished from any other failure so the cap we chose is answered as a refusal
 * (413) rather than reported to the client as our own crash. */
class PayloadTooLargeError extends Error {}

function declaresOversizedBody(req: IncomingMessage): boolean {
  const declared = Number(req.headers["content-length"]);
  return Number.isFinite(declared) && declared > MAX_BODY_BYTES;
}

function readBody(req: IncomingMessage): Promise<string> {
  if (declaresOversizedBody(req)) {
    return Promise.reject(
      new PayloadTooLargeError(`declared ${req.headers["content-length"]} bytes`)
    );
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
        return;
      }
      // Pause rather than destroy: destroying here kills the socket before the refusal can
      // be written, and the client sees a reset instead of being told what it did wrong.
      // The caller destroys once the 413 is out.
      req.pause();
      reject(new PayloadTooLargeError(`exceeded ${MAX_BODY_BYTES} bytes`));
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
    // A client that vanishes mid-body fires neither `end` nor `error`; without this the
    // promise never settles and its closure outlives the request.
    req.on("close", () => reject(new Error("client closed the connection mid-body")));
  });
}

/**
 * `node:http` only — no framework, no OTLP SDK. Owns exactly the OTLP/HTTP protocol
 * surface: which three paths exist, that every one of them answers 200 with `{}` so an
 * exporter that already delivered a payload never retries it, and that a body which
 * fails to parse is logged and dropped rather than taking the process down. Every
 * judgement about what a payload *means* lives in `ReceiveTelemetryUseCase` and the
 * phase-1 mapper it calls — this class never inspects an attribute.
 */
export class OtlpHttpReceiverAdapter {
  private server: Server | null = null;

  constructor(
    private readonly useCase: ReceiveTelemetryUseCase,
    private readonly logger: Logger
  ) {}

  async listen(port: number): Promise<{ readonly port: number }> {
    const server = createServer((req, res) => {
      this.handleRequest(req, res).catch((error: unknown) => {
        this.logger.warn(
          `telemetry receive: unhandled error — ${error instanceof Error ? error.message : String(error)}`
        );
        if (!res.headersSent) res.writeHead(500);
        res.end();
      });
    });
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      // Loopback only: the endpoint takes anything anyone posts, with no authentication.
      // Without a host, node binds every interface, which would put an open writable
      // sink on the local network.
      server.listen(port, LOOPBACK_HOST, () => resolve());
    });
    const address = server.address();
    const boundPort = typeof address === "object" && address !== null ? address.port : port;
    return { port: boundPort };
  }

  async close(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    this.server = null;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url?.split("?")[0];
    if (req.method !== "POST" || !path || !OTLP_PATHS.has(path)) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(EMPTY_JSON_OBJECT);
      return;
    }

    const rawBody = await this.readBodyOrRefuse(req, res);
    if (rawBody === null) return;

    const payload = this.parseBody(rawBody);
    if (payload !== undefined) {
      await this.useCase.receive(path as TelemetryOtlpPath, payload);
    }

    res.writeHead(200, { "content-type": "application/json" });
    res.end(EMPTY_JSON_OBJECT);
  }

  private async readBodyOrRefuse(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<string | null> {
    try {
      return await readBody(req);
    } catch (error) {
      if (!(error instanceof PayloadTooLargeError)) throw error;
      this.logger.warn(`telemetry receive: refused an oversized payload — ${error.message}`);
      if (!res.headersSent) {
        res.writeHead(413, { "content-type": "application/json", connection: "close" });
        res.end(EMPTY_JSON_OBJECT);
      }
      res.on("finish", () => req.destroy());
      return null;
    }
  }

  private parseBody(rawBody: string): unknown {
    try {
      return JSON.parse(rawBody);
    } catch {
      this.logger.warn("telemetry receive: dropped a payload that was not valid JSON");
      return undefined;
    }
  }
}
