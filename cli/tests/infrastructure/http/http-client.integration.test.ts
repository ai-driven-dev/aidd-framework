import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it } from "vitest";
import { HttpClient } from "../../../src/infrastructure/http/http-client.js";
import { AuthenticationError } from "../../../src/kernel/errors.js";

function startServer(
  handler: (
    req: import("node:http").IncomingMessage,
    res: import("node:http").ServerResponse
  ) => void
) {
  const server = createServer(handler);
  return new Promise<{ url: string; close: () => Promise<void> }>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe("HttpClient", () => {
  let client: HttpClient;

  beforeEach(() => {
    client = new HttpClient();
  });

  describe("GET JSON response", () => {
    it("parses and provides JSON body from response", async () => {
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ tag_name: "v1.0.0" }));
      });

      try {
        const response = await client.get(url);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ tag_name: "v1.0.0" });
      } finally {
        await close();
      }
    });

    it("sends auth header when token provided", async () => {
      let receivedAuth: string | undefined;
      const { url, close } = await startServer((req, res) => {
        receivedAuth = req.headers.authorization;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });

      try {
        await client.get(url, { token: "my-secret-token" });
        expect(receivedAuth).toBe("Bearer my-secret-token");
      } finally {
        await close();
      }
    });

    it("does not send auth header when no token", async () => {
      let receivedAuth: string | undefined;
      const { url, close } = await startServer((req, res) => {
        receivedAuth = req.headers.authorization;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });

      try {
        await client.get(url);
        expect(receivedAuth).toBeUndefined();
      } finally {
        await close();
      }
    });
  });

  describe("GET binary response", () => {
    it("provides raw Buffer for non-JSON content", async () => {
      const content = Buffer.from("binary data here");
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/octet-stream" });
        res.end(content);
      });

      try {
        const response = await client.get(url);
        expect(response.statusCode).toBe(200);
        expect(Buffer.isBuffer(response.body)).toBe(true);
        expect(response.body).toEqual(content);
      } finally {
        await close();
      }
    });
  });

  describe("redirect following", () => {
    it("follows a 302 redirect", async () => {
      const { url: finalUrl, close: closeFinal } = await startServer((_req, res) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ redirected: true }));
      });

      const { url: redirectUrl, close: closeRedirect } = await startServer((_req, res) => {
        res.writeHead(302, { Location: finalUrl });
        res.end();
      });

      try {
        const response = await client.get(redirectUrl);
        expect(response.statusCode).toBe(200);
        expect(response.body).toEqual({ redirected: true });
      } finally {
        await closeRedirect();
        await closeFinal();
      }
    });
  });

  describe("error handling", () => {
    it("throws AuthenticationError when server responds 401", async () => {
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(401);
        res.end();
      });

      try {
        await expect(client.get(url)).rejects.toThrow(AuthenticationError);
        await expect(client.get(url)).rejects.toThrow("Authentication failed (HTTP 401)");
      } finally {
        await close();
      }
    });

    it("throws AuthenticationError when server responds 403", async () => {
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(403);
        res.end();
      });

      try {
        await expect(client.get(url)).rejects.toThrow(AuthenticationError);
        await expect(client.get(url)).rejects.toThrow("Authentication failed (HTTP 403)");
      } finally {
        await close();
      }
    });

    it("reports not found when resource does not exist", async () => {
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(404);
        res.end();
      });

      try {
        await expect(client.get(url)).rejects.toThrow("Resource not found (HTTP 404)");
      } finally {
        await close();
      }
    });

    it("reports an error on unexpected status code", async () => {
      const { url, close } = await startServer((_req, res) => {
        res.writeHead(500);
        res.end();
      });

      try {
        await expect(client.get(url)).rejects.toThrow("Unexpected HTTP 500");
      } finally {
        await close();
      }
    });
  });
});
