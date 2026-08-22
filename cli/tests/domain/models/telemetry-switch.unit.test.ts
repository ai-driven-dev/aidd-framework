import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildTelemetrySwitchFile,
  isValidTelemetryEndpoint,
  parseTelemetrySwitchFile,
  telemetryConfigPath,
} from "../../../src/domain/models/telemetry-switch.js";

describe("telemetryConfigPath", () => {
  it("resolves .aidd/config.json under the project root", () => {
    expect(telemetryConfigPath("/repo")).toBe(join("/repo", ".aidd", "config.json"));
  });
});

describe("parseTelemetrySwitchFile", () => {
  it("reads enabled and endpoint from a well-formed switch", () => {
    const config = parseTelemetrySwitchFile(
      JSON.stringify({ telemetry: { enabled: true, endpoint: "https://otel.example.com" } })
    );
    expect(config).toEqual({ enabled: true, endpoint: "https://otel.example.com" });
  });

  it("reads enabled: false without an endpoint", () => {
    const config = parseTelemetrySwitchFile(JSON.stringify({ telemetry: { enabled: false } }));
    expect(config).toEqual({ enabled: false, endpoint: undefined });
  });

  it("treats a non-boolean-true enabled value as off, not a throw", () => {
    const config = parseTelemetrySwitchFile(JSON.stringify({ telemetry: { enabled: "yes" } }));
    expect(config?.enabled).toBe(false);
  });

  it("returns null for unparseable JSON — the same failure direction as the hook", () => {
    expect(parseTelemetrySwitchFile("not json")).toBeNull();
  });

  it("returns null when the telemetry key is absent", () => {
    expect(parseTelemetrySwitchFile(JSON.stringify({ other: true }))).toBeNull();
  });

  it("returns null when the telemetry key has the wrong shape", () => {
    expect(parseTelemetrySwitchFile(JSON.stringify({ telemetry: "on" }))).toBeNull();
    expect(parseTelemetrySwitchFile(JSON.stringify({ telemetry: [1, 2] }))).toBeNull();
  });
});

describe("isValidTelemetryEndpoint", () => {
  it("accepts http and https URLs", () => {
    expect(isValidTelemetryEndpoint("https://otel.example.com")).toBe(true);
    expect(isValidTelemetryEndpoint("http://127.0.0.1:4318")).toBe(true);
  });

  it("rejects non-http(s) schemes and unparseable values", () => {
    expect(isValidTelemetryEndpoint("ftp://example.com")).toBe(false);
    expect(isValidTelemetryEndpoint("not a url")).toBe(false);
    expect(isValidTelemetryEndpoint("")).toBe(false);
  });
});

describe("buildTelemetrySwitchFile", () => {
  it("writes enabled and endpoint from nothing", () => {
    const content = buildTelemetrySwitchFile(null, {
      enabled: true,
      endpoint: "https://otel.example.com",
    });
    expect(JSON.parse(content)).toEqual({
      telemetry: { enabled: true, endpoint: "https://otel.example.com" },
    });
  });

  it("omits the endpoint key when none is given", () => {
    const content = buildTelemetrySwitchFile(null, { enabled: false });
    expect(JSON.parse(content)).toEqual({ telemetry: { enabled: false } });
  });

  it("preserves unrelated top-level keys already in the file", () => {
    const existing = JSON.stringify({ other: { nested: true } }, null, 2);
    const content = buildTelemetrySwitchFile(existing, {
      enabled: true,
      endpoint: "https://otel.example.com",
    });
    const parsed = JSON.parse(content);
    expect(parsed.other).toEqual({ nested: true });
    expect(parsed.telemetry).toEqual({ enabled: true, endpoint: "https://otel.example.com" });
  });

  it("falls back to an empty root when the existing content is unparseable", () => {
    const content = buildTelemetrySwitchFile("not json", {
      enabled: true,
      endpoint: "https://otel.example.com",
    });
    expect(JSON.parse(content)).toEqual({
      telemetry: { enabled: true, endpoint: "https://otel.example.com" },
    });
  });
});
