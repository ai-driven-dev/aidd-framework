import { request } from "node:http";
import { connect } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { OtlpHttpReceiverAdapter } from "../../../src/infrastructure/adapters/otlp-http-receiver-adapter.js";
import { CapturingLogger } from "../../helpers/ports/capturing-logger.js";

const received: unknown[] = [];

const useCase = {
  receive: async (_path: string, payload: unknown) => {
    received.push(payload);
  },
} as unknown as ConstructorParameters<typeof OtlpHttpReceiverAdapter>[0];

let adapter: OtlpHttpReceiverAdapter | null = null;

async function startOnEphemeralPort() {
  adapter = new OtlpHttpReceiverAdapter(useCase, new CapturingLogger());
  const { port } = await adapter.listen(0);
  return port;
}

afterEach(async () => {
  await adapter?.close();
  adapter = null;
  received.length = 0;
});

describe("OtlpHttpReceiverAdapter — the listening surface", () => {
  // The endpoint accepts anything anyone posts, with no authentication. Node binds every
  // interface when no host is given, which would put an open writable sink on the local
  // network — so this asserts the address, not merely that something is listening.
  it("listens on loopback only, never on every interface", async () => {
    const port = await startOnEphemeralPort();
    expect(port).toBeGreaterThan(0);

    const fromLoopback = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
      method: "POST",
      body: "{}",
    });
    expect(fromLoopback.status).toBe(200);

    const address = (
      adapter as unknown as { server: { address(): { address: string } } }
    ).server.address();
    expect(address.address).toBe("127.0.0.1");
  });

  // Two defenses, each tested where it is observable. A declared oversize is refused before
  // a byte is read, so the client is idle and sees the 413. A stream that grows past the cap
  // is refused mid-flight, and a client still blasting megabytes sees its own broken pipe
  // rather than the answer — what matters there is that nothing was stored and the receiver
  // survived.
  it("refuses a declared oversized body before reading it", async () => {
    const port = await startOnEphemeralPort();

    const status = await new Promise<number>((resolve, reject) => {
      const socket = connect(port, "127.0.0.1", () => {
        socket.write(
          `POST /v1/logs HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: ${64 * 1024 * 1024}\r\n\r\n`
        );
      });
      socket.on("data", (chunk) => {
        const match = /^HTTP\/1\.1 (\d{3})/.exec(chunk.toString("utf8"));
        if (match) resolve(Number(match[1]));
        socket.destroy();
      });
      socket.on("error", reject);
    });

    expect(status).toBe(413);
    expect(received).toHaveLength(0);
  });

  it("refuses a stream that grows past the cap, stores nothing, and stays up", async () => {
    const port = await startOnEphemeralPort();
    // Valid OTLP, padded past the cap: a body of junk would be dropped as bad JSON whether
    // or not the cap exists, and the test would pass while proving nothing.
    const oversizedButValid = JSON.stringify({
      resourceLogs: [
        {
          resource: { attributes: [] },
          scopeLogs: [
            {
              logRecords: [
                {
                  attributes: [
                    { key: "session.id", value: { stringValue: "s-oversized" } },
                    { key: "cost_usd", value: { doubleValue: 1 } },
                    { key: "padding", value: { stringValue: "x".repeat(9 * 1024 * 1024) } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    await new Promise<void>((resolve) => {
      const req = request({ host: "127.0.0.1", port, path: "/v1/logs", method: "POST" }, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => resolve());
      req.write(oversizedButValid);
      req.end();
    });

    expect(received).toHaveLength(0);

    const after = await fetch(`http://127.0.0.1:${port}/v1/logs`, { method: "POST", body: "{}" });
    expect(after.status).toBe(200);
    expect(received).toHaveLength(1);
  });
});
