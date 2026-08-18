import { describe, expect, it } from "vitest";
// Side-effect imports: TelemetryOnUseCase now resolves each tool's telemetry story from
// the registry, so every AI tool must be registered for these tests to see it.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { EnableToolTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/enable-tool-telemetry-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-on-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/repo";
const HOME_DIR = "/home/dev";
const SWITCH_PATH = "/repo/.aidd/config.json";
const LOCAL_SETTINGS_PATH = "/repo/.claude/settings.local.json";
const PROJECT_SETTINGS_PATH = "/repo/.claude/settings.json";
const ENDPOINT = "https://otel.example.com";
const STUB_PROJECT_ID = "stub/project";

function claudeManifest(): Manifest {
  return manifestWith("claude");
}

function manifestWith(...tools: readonly string[]): Manifest {
  const manifest = Manifest.create();
  for (const tool of tools)
    manifest.addTool(tool as Parameters<Manifest["addTool"]>[0], "1.0.0", []);
  return manifest;
}

function buildUseCase(manifest: Manifest | null = null) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  const manifestRepo = new InMemoryManifestRepository(manifest);
  const logger = new CapturingLogger();
  const enableClaude = new EnableToolTelemetryUseCase(fs, hasher, manifestRepo, logger);
  const useCase = new TelemetryOnUseCase(
    fs,
    manifestRepo,
    enableClaude,
    logger,
    async () => STUB_PROJECT_ID
  );
  return { fs, manifestRepo, logger, useCase };
}

function baseOptions(overrides: Partial<Parameters<TelemetryOnUseCase["execute"]>[0]> = {}) {
  return {
    projectRoot: PROJECT_ROOT,
    homeDir: HOME_DIR,
    endpoint: ENDPOINT,
    scope: "local" as const,
    confirmProjectScope: false,
    ...overrides,
  };
}

describe("TelemetryOnUseCase — the switch, with no tool installed", () => {
  it("still writes the switch and says so, reporting claude as not installed", async () => {
    const { fs, useCase } = buildUseCase(null);
    const result = await useCase.execute(baseOptions());

    expect(result.switchChanged).toBe(true);
    const written = JSON.parse(fs.getFile(SWITCH_PATH) ?? "null");
    expect(written.telemetry).toEqual({ enabled: true, endpoint: ENDPOINT });

    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude?.status).toBe("not-installed");
  });
});

describe("TelemetryOnUseCase — per-tool honesty", () => {
  it("reports cursor as cannot-enable, never as enabled", async () => {
    const { useCase } = buildUseCase(manifestWith("claude", "cursor"));
    const result = await useCase.execute(baseOptions());
    const cursor = result.toolReports.find((r) => r.tool === "cursor");
    expect(cursor?.status).toBe("cannot-enable");
    expect(cursor?.status).not.toBe("enabled");
  });

  it("reports copilot's environment variable rather than claiming to have set it", async () => {
    const { fs, useCase } = buildUseCase(manifestWith("claude", "copilot"));
    const before = fs.listAll();
    const result = await useCase.execute(baseOptions());
    const copilot = result.toolReports.find((r) => r.tool === "copilot");
    expect(copilot?.status).toBe("not-a-file");
    expect(copilot?.detail).toContain("COPILOT_OTEL_ENABLED");
    // Nothing new on disk beyond the switch and claude's settings file — copilot's
    // "config" is a variable the user exports themselves.
    const after = fs.listAll();
    expect(after.length).toBe(before.length + 2);
  });

  it("reports codex and opencode as not yet supported, tracked in #653", async () => {
    const { useCase } = buildUseCase(manifestWith("claude", "codex", "opencode"));
    const result = await useCase.execute(baseOptions());
    for (const tool of ["codex", "opencode"] as const) {
      const report = result.toolReports.find((r) => r.tool === tool);
      expect(report?.status).toBe("not-yet-supported");
      expect(report?.detail).toContain("#653");
    }
  });

  it("tells a claude-only project the other four are not installed, not a roadmap item", async () => {
    const { useCase } = buildUseCase(claudeManifest());
    const result = await useCase.execute(baseOptions());

    for (const tool of ["codex", "opencode", "copilot", "cursor"] as const) {
      const report = result.toolReports.find((r) => r.tool === tool);
      expect(report?.status).toBe("not-installed");
      expect(report?.detail).not.toContain("#653");
    }
  });

  it("enables claude when installed, naming the file it wrote", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    const result = await useCase.execute(baseOptions());
    const claude = result.toolReports.find((r) => r.tool === "claude");
    expect(claude?.status).toBe("enabled");
    expect(claude?.detail).toBe(LOCAL_SETTINGS_PATH);
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(true);
  });
});

describe("TelemetryOnUseCase — scope", () => {
  it("defaults to local: the local file is written and the tracked one is untouched", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    await useCase.execute(baseOptions());
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(true);
    expect(fs.has(PROJECT_SETTINGS_PATH)).toBe(false);
  });

  it("--scope project without --yes exits (throws) and writes nothing at all, on disk", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    await expect(
      useCase.execute(baseOptions({ scope: "project", confirmProjectScope: false }))
    ).rejects.toThrow(/--yes/);

    expect(fs.has(SWITCH_PATH)).toBe(false);
    expect(fs.has(PROJECT_SETTINGS_PATH)).toBe(false);
    expect(fs.listAll()).toHaveLength(0);
  });

  it("--scope project with --yes writes the tracked settings file", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    const result = await useCase.execute(
      baseOptions({ scope: "project", confirmProjectScope: true })
    );
    expect(result.toolReports.find((r) => r.tool === "claude")?.detail).toBe(PROJECT_SETTINGS_PATH);
    expect(fs.has(PROJECT_SETTINGS_PATH)).toBe(true);
  });

  it("notes the user-scope undo-path caveat without failing", async () => {
    const { logger, useCase } = buildUseCase(claudeManifest());
    await useCase.execute(baseOptions({ scope: "user" }));
    expect(logger.infoMessages.some((m) => m.includes("if the project directory moves"))).toBe(
      true
    );
  });
});

describe("TelemetryOnUseCase — say the file before touching it", () => {
  it("prints every resolved path before writing anything, even on refusal", async () => {
    const { fs, logger, useCase } = buildUseCase(claudeManifest());
    await expect(
      useCase.execute(baseOptions({ scope: "project", confirmProjectScope: false }))
    ).rejects.toThrow();

    expect(logger.infoMessages).toContain(`AIDD telemetry switch -> ${SWITCH_PATH}`);
    expect(logger.infoMessages.some((m) => m.includes(PROJECT_SETTINGS_PATH))).toBe(true);
    expect(fs.listAll()).toHaveLength(0);
  });

  it("prints the resolved path before writing on the happy path too", async () => {
    const { logger, useCase } = buildUseCase(claudeManifest());
    await useCase.execute(baseOptions());
    expect(logger.infoMessages[0]).toBe(`AIDD telemetry switch -> ${SWITCH_PATH}`);
  });
});

describe("TelemetryOnUseCase — endpoint resolution", () => {
  it("fails with no default, not even localhost, and writes nothing", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    await expect(useCase.execute(baseOptions({ endpoint: undefined }))).rejects.toThrow(
      /no default/i
    );
    expect(fs.listAll()).toHaveLength(0);
  });

  it("rejects an invalid endpoint shape and writes nothing", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    await expect(useCase.execute(baseOptions({ endpoint: "not a url" }))).rejects.toThrow(
      /invalid/i
    );
    expect(fs.listAll()).toHaveLength(0);
  });

  it("reuses the stored endpoint on a second run with no --endpoint flag", async () => {
    const { fs, useCase } = buildUseCase(claudeManifest());
    await useCase.execute(baseOptions());
    const result = await useCase.execute(baseOptions({ endpoint: undefined }));
    expect(result.endpoint).toBe(ENDPOINT);
    expect(fs.getFile(SWITCH_PATH)).toContain(ENDPOINT);
  });

  it("an explicit --endpoint overrides a previously stored one", async () => {
    const { useCase } = buildUseCase(claudeManifest());
    await useCase.execute(baseOptions());
    const result = await useCase.execute(baseOptions({ endpoint: "https://other.example.com" }));
    expect(result.endpoint).toBe("https://other.example.com");
  });
});

describe("TelemetryOnUseCase — idempotency", () => {
  it("enabling twice reports the switch unchanged the second time", async () => {
    const { useCase } = buildUseCase(claudeManifest());
    const first = await useCase.execute(baseOptions());
    const second = await useCase.execute(baseOptions());
    expect(first.switchChanged).toBe(true);
    expect(second.switchChanged).toBe(false);
  });
});
