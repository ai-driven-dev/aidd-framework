import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildTelemetrySwitchFile,
  isValidTelemetryEndpoint,
  parseTelemetrySwitchFile,
  personRefusesTelemetry,
  resolveTelemetryEnabled,
  type TelemetrySwitch,
  telemetryConfigPath,
} from "../../../src/domain/models/telemetry-switch.js";
import { journalRepo } from "../../helpers/telemetry-journal-hook.js";

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

describe("personRefusesTelemetry", () => {
  it("only the literal string '0' is a refusal", () => {
    expect(personRefusesTelemetry({ AIDD_TELEMETRY: "0" })).toBe(true);
  });

  it("unset, empty, or any other value is not a choice — never a refusal", () => {
    expect(personRefusesTelemetry({})).toBe(false);
    expect(personRefusesTelemetry({ AIDD_TELEMETRY: "" })).toBe(false);
    expect(personRefusesTelemetry({ AIDD_TELEMETRY: "1" })).toBe(false);
    expect(personRefusesTelemetry({ AIDD_TELEMETRY: "false" })).toBe(false);
    expect(personRefusesTelemetry({ AIDD_TELEMETRY: "no" })).toBe(false);
  });
});

describe("resolveTelemetryEnabled", () => {
  const ON: TelemetrySwitch = { enabled: true };
  const OFF: TelemetrySwitch = { enabled: false };

  it("the refusal wins over a project that turned measurement on", () => {
    expect(resolveTelemetryEnabled(ON, { AIDD_TELEMETRY: "0" })).toBe(false);
  });

  it("no refusal, project on — enabled", () => {
    expect(resolveTelemetryEnabled(ON, {})).toBe(true);
  });

  it("no refusal, project off or absent — not enabled", () => {
    expect(resolveTelemetryEnabled(OFF, {})).toBe(false);
    expect(resolveTelemetryEnabled(null, {})).toBe(false);
  });

  it("an unset refusal never turns measurement on by itself", () => {
    expect(resolveTelemetryEnabled(null, { AIDD_TELEMETRY: "" })).toBe(false);
  });
});

describe("the hook (repo.cjs) and the CLI agree, for every combination", () => {
  let repoRoot: string;
  const originalEnv = process.env.AIDD_TELEMETRY;

  beforeEach(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "telemetry-switch-parity-"));
    await mkdir(join(repoRoot, ".aidd"), { recursive: true });
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    if (originalEnv === undefined) delete process.env.AIDD_TELEMETRY;
    else process.env.AIDD_TELEMETRY = originalEnv;
  });

  async function seedSwitch(enabled: boolean | null): Promise<TelemetrySwitch | null> {
    if (enabled === null) return null;
    await writeFile(
      join(repoRoot, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled } })
    );
    return { enabled };
  }

  const CASES: readonly {
    readonly label: string;
    readonly fileEnabled: boolean | null;
    readonly envValue: string | undefined;
    readonly expected: boolean;
  }[] = [
    { label: "file on, no refusal", fileEnabled: true, envValue: undefined, expected: true },
    { label: "file off, no refusal", fileEnabled: false, envValue: undefined, expected: false },
    { label: "no file, no refusal", fileEnabled: null, envValue: undefined, expected: false },
    { label: "file on, refused", fileEnabled: true, envValue: "0", expected: false },
    { label: "file off, refused", fileEnabled: false, envValue: "0", expected: false },
    { label: "no file, refused", fileEnabled: null, envValue: "0", expected: false },
    {
      label: "file on, empty refusal is not a choice",
      fileEnabled: true,
      envValue: "",
      expected: true,
    },
    {
      label: "file on, any other value is not a choice",
      fileEnabled: true,
      envValue: "1",
      expected: true,
    },
  ];

  for (const { label, fileEnabled, envValue, expected } of CASES) {
    it(`${label} => ${expected}`, async () => {
      const fileSwitch = await seedSwitch(fileEnabled);
      if (envValue === undefined) delete process.env.AIDD_TELEMETRY;
      else process.env.AIDD_TELEMETRY = envValue;

      const hookResult = journalRepo.telemetryEnabled(repoRoot);
      const cliResult = resolveTelemetryEnabled(fileSwitch, process.env);

      expect(hookResult).toBe(expected);
      expect(cliResult).toBe(expected);
    });
  }
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
