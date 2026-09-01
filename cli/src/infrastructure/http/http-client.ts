import type { IncomingMessage } from "node:http";
import * as http from "node:http";
import * as https from "node:https";
import { AuthenticationError } from "../../kernel/errors.js";
import { HttpError, HttpNotFoundError, HttpRedirectError } from "../errors.js";

interface HttpGetOptions {
  token?: string;
  accept?: string;
}

interface HttpResponse {
  body: Buffer | unknown;
  statusCode: number;
  contentType: string;
}

function collectBuffer(response: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => resolve(Buffer.concat(chunks)));
    response.on("error", reject);
  });
}

function buildHeaders(token?: string, accept?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": "aidd-cli",
    Accept: accept ?? "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function doGet(url: string, token?: string, accept?: string): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: buildHeaders(token, accept),
      },
      resolve
    );
    req.on("error", reject);
    req.end();
  });
}

export class HttpClient {
  async get(url: string, options?: HttpGetOptions): Promise<HttpResponse> {
    const response = await doGet(url, options?.token, options?.accept);
    const statusCode = response.statusCode ?? 0;

    if (statusCode === 302 || statusCode === 301) {
      const location = response.headers.location;
      if (!location) {
        throw new HttpRedirectError(url);
      }
      // Consume the body to free the socket
      await collectBuffer(response);
      // Do not forward token or accept: redirect targets (S3/CDN) use signed URLs
      const redirected = await doGet(location, undefined, undefined);
      return this.parseResponse(redirected, location);
    }

    return this.parseResponse(response, url);
  }

  private async parseResponse(response: IncomingMessage, url: string): Promise<HttpResponse> {
    const statusCode = response.statusCode ?? 0;
    const contentType = response.headers["content-type"] ?? "";

    if (statusCode === 401 || statusCode === 403) {
      await collectBuffer(response);
      throw new AuthenticationError(`HTTP ${statusCode}`);
    }

    if (statusCode === 404) {
      await collectBuffer(response);
      throw new HttpNotFoundError(url);
    }

    if (statusCode < 200 || statusCode >= 300) {
      await collectBuffer(response);
      throw new HttpError(statusCode, url);
    }

    const buffer = await collectBuffer(response);

    if (contentType.includes("application/json")) {
      const text = buffer.toString("utf-8");
      return { body: JSON.parse(text) as unknown, statusCode, contentType };
    }

    return { body: buffer, statusCode, contentType };
  }
}
