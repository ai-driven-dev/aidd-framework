import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CleanUseCase } from "../../../../src/application/use-cases/clean-use-case.js";
import { GitignoreUseCase } from "../../../../src/application/use-cases/shared/gitignore-use-case.js";
import { EnableToolTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/enable-tool-telemetry-use-case.js";
import type { TelemetrySettingsFileActivation } from "../../../../src/domain/capabilities/telemetry-capability.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { claude } from "../../../../src/domain/tools/ai/claude.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/repo";
const HOME_DIR = "/home/dev";
const ENDPOINT = "https://otel.example.com";
const PROJECT_ID = "ai-driven-dev/framework";
const LOCAL_SETTINGS_PATH = join(PROJECT_ROOT, ".claude", "settings.local.json");

const KNOWN_KEYS = [
  "CLAUDE_CODE_ENABLE_TELEMETRY",
  "OTEL_METRICS_EXPORTER",
  "OTEL_LOGS_EXPORTER",
  "OTEL_EXPORTER_OTLP_PROTOCOL",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "OTEL_METRIC_EXPORT_INTERVAL",
  "OTEL_RESOURCE_ATTRIBUTES",
];

// Proves this use-case is tool-agnostic: `claude.telemetry` is what the rest
// of this file drives it with, but nothing here reaches for the literal "claude" — every
// path, section key, and env key set comes from the activation object.
function claudeTelemetryActivation(): TelemetrySettingsFileActivation {
  const activation = claude.telemetry;
  if (activation.kind !== "settings-file") {
    throw new Error("test fixture assumption broken: claude's telemetry is settings-file");
  }
  return activation;
}

function seedClaudeManifest(): Manifest {
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  return manifest;
}

function buildDeps() {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter({}, hasher);
  const manifestRepo = new InMemoryManifestRepository(seedClaudeManifest());
  const logger = new CapturingLogger();
  const useCase = new EnableToolTelemetryUseCase(fs, hasher, manifestRepo, logger);
  return { hasher, fs, manifestRepo, logger, useCase };
}

function enableLocal(useCase: EnableToolTelemetryUseCase) {
  return useCase.execute({
    toolId: "claude",
    activation: claudeTelemetryActivation(),
    projectRoot: PROJECT_ROOT,
    homeDir: HOME_DIR,
    endpoint: ENDPOINT,
    projectId: PROJECT_ID,
    scope: "local",
  });
}

describe("EnableToolTelemetryUseCase — driven by Claude's settings-file activation", () => {
  it("writes local scope to .claude/settings.local.json", async () => {
    const { fs, useCase } = buildDeps();
    const result = await enableLocal(useCase);
    expect(result.settingsPath).toBe(LOCAL_SETTINGS_PATH);
    const written = JSON.parse(fs.getFile(result.settingsPath) ?? "null");
    expect(written.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("1");
    expect(written.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe(ENDPOINT);
    expect(written.env.OTEL_RESOURCE_ATTRIBUTES).toBe(`aidd.project_id=${PROJECT_ID}`);
  });

  it("writes project scope to .claude/settings.json", async () => {
    const { fs, useCase } = buildDeps();
    const result = await useCase.execute({
      toolId: "claude",
      activation: claudeTelemetryActivation(),
      projectRoot: PROJECT_ROOT,
      homeDir: HOME_DIR,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      scope: "project",
    });
    const projectSettingsPath = join(PROJECT_ROOT, ".claude", "settings.json");
    expect(result.settingsPath).toBe(projectSettingsPath);
    expect(fs.has(projectSettingsPath)).toBe(true);
  });

  it("writes user scope under the home directory, outside the project", async () => {
    const { useCase } = buildDeps();
    const result = await useCase.execute({
      toolId: "claude",
      activation: claudeTelemetryActivation(),
      projectRoot: PROJECT_ROOT,
      homeDir: HOME_DIR,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      scope: "user",
    });
    expect(result.settingsPath).toBe(join(HOME_DIR, ".claude", "settings.json"));
  });

  it("preserves unrelated top-level keys already in the settings file", async () => {
    const { fs, useCase } = buildDeps();
    fs.setFile(
      LOCAL_SETTINGS_PATH,
      JSON.stringify({ permissions: { allow: ["Bash(ls:*)"] } }, null, 2)
    );
    await enableLocal(useCase);
    const written = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) ?? "null");
    expect(written.permissions).toEqual({ allow: ["Bash(ls:*)"] });
  });

  it("preserves an unrelated pre-existing env var it did not add", async () => {
    const { fs, useCase } = buildDeps();
    fs.setFile(LOCAL_SETTINGS_PATH, JSON.stringify({ env: { MY_CUSTOM_VAR: "keep-me" } }, null, 2));
    await enableLocal(useCase);
    const written = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) ?? "null");
    expect(written.env.MY_CUSTOM_VAR).toBe("keep-me");
    expect(written.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBe("1");
  });

  it("prints the resolved path before writing, then the activation's post-enable notice", async () => {
    const { logger, useCase } = buildDeps();
    await enableLocal(useCase);
    const joined = logger.infoMessages.join("\n");
    expect(joined).toContain(LOCAL_SETTINGS_PATH);
    expect(joined).toContain("Per-step cost comes from the run journal");
    expect(joined).toContain("no Bash command, MCP tool name, or tool input is logged");
  });

  it("throws a caller error when the endpoint is absent", async () => {
    const { useCase } = buildDeps();
    await expect(
      useCase.execute({
        toolId: "claude",
        activation: claudeTelemetryActivation(),
        projectRoot: PROJECT_ROOT,
        homeDir: HOME_DIR,
        endpoint: undefined,
        projectId: PROJECT_ID,
        scope: "local",
      })
    ).rejects.toThrow(/no default/i);
  });

  it("records a claude MergeFileEntry with our exact key set", async () => {
    const { manifestRepo, useCase } = buildDeps();
    await enableLocal(useCase);
    const mergeFiles = manifestRepo.getCurrent()?.getMergeFiles("claude") ?? [];
    expect(mergeFiles).toHaveLength(1);
    expect(mergeFiles[0].relativePath).toBe(".claude/settings.local.json");
    expect(mergeFiles[0].sectionKey).toBe("env");
    expect(Object.keys(mergeFiles[0].entries).sort()).toEqual([...KNOWN_KEYS].sort());
  });

  it("enabling twice changes nothing the second time", async () => {
    const { fs, manifestRepo, useCase } = buildDeps();
    await enableLocal(useCase);
    const contentAfterFirst = fs.getFile(LOCAL_SETTINGS_PATH);
    const manifestAfterFirst = JSON.stringify(manifestRepo.getCurrent()?.toJSON());

    await enableLocal(useCase);
    const contentAfterSecond = fs.getFile(LOCAL_SETTINGS_PATH);
    const manifestAfterSecond = JSON.stringify(manifestRepo.getCurrent()?.toJSON());

    expect(contentAfterSecond).toBe(contentAfterFirst);
    expect(manifestAfterSecond).toBe(manifestAfterFirst);
  });

  it("a hand-edited value inside our set is overwritten by enable, and a key outside it survives clean", async () => {
    const { fs, manifestRepo, useCase } = buildDeps();
    await enableLocal(useCase);

    const settings = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) ?? "null");
    settings.env.OTEL_METRIC_EXPORT_INTERVAL = "999999";
    settings.env.MY_OWN_VAR = "not-ours";
    fs.setFile(LOCAL_SETTINGS_PATH, JSON.stringify(settings, null, 2));

    await enableLocal(useCase);
    const reMerged = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) ?? "null");
    expect(reMerged.env.OTEL_METRIC_EXPORT_INTERVAL).toBe("10000");
    expect(reMerged.env.MY_OWN_VAR).toBe("not-ours");

    const cleanUseCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await cleanUseCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    const afterClean = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) as string);
    expect(afterClean.env.CLAUDE_CODE_ENABLE_TELEMETRY).toBeUndefined();
    expect(afterClean.env.OTEL_METRIC_EXPORT_INTERVAL).toBeUndefined();
    expect(afterClean.env.MY_OWN_VAR).toBe("not-ours");
  });

  it("enable then clean leaves the settings file byte-identical, unrelated keys included", async () => {
    const { fs, manifestRepo, useCase } = buildDeps();
    const before = JSON.stringify(
      { permissions: { allow: ["Bash(ls:*)"] }, model: "opus" },
      null,
      2
    );
    fs.setFile(LOCAL_SETTINGS_PATH, before);

    await enableLocal(useCase);
    expect(fs.getFile(LOCAL_SETTINGS_PATH)).not.toBe(before);

    const cleanUseCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await cleanUseCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.getFile(LOCAL_SETTINGS_PATH)).toBe(before);
  });

  it("user scope: records a projectRoot-relative traversal path, and clean restores the home-dir file byte-identical", async () => {
    const { fs, manifestRepo, useCase } = buildDeps();
    const homeSettingsPath = join(HOME_DIR, ".claude", "settings.json");
    const before = JSON.stringify({ model: "opus" }, null, 2);
    fs.setFile(homeSettingsPath, before);

    const result = await useCase.execute({
      toolId: "claude",
      activation: claudeTelemetryActivation(),
      projectRoot: PROJECT_ROOT,
      homeDir: HOME_DIR,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      scope: "user",
    });
    expect(result.settingsPath).toBe(homeSettingsPath);
    expect(fs.getFile(homeSettingsPath)).not.toBe(before);

    // The manifest is per-project; a user-scope target lives outside projectRoot, so it
    // is recorded as a `..`-prefixed traversal from projectRoot — the same trick
    // `path.join(projectRoot, relativePath)` (used throughout clean-use-case.ts) already
    // resolves correctly, with no changes needed there.
    const mergeFiles = manifestRepo.getCurrent()?.getMergeFiles("claude") ?? [];
    expect(mergeFiles).toHaveLength(1);
    expect(mergeFiles[0].relativePath).toBe("../home/dev/.claude/settings.json");

    const cleanUseCase = new CleanUseCase(
      fs,
      manifestRepo,
      new CapturingLogger(),
      new GitignoreUseCase(fs)
    );
    await cleanUseCase.execute({ projectRoot: PROJECT_ROOT, force: true });

    expect(fs.getFile(homeSettingsPath)).toBe(before);
  });
});

describe("EnableToolTelemetryUseCase — genuinely tool-agnostic", () => {
  it("drives an unrelated tool id and section key from a synthetic activation, untouched by any claude-specific path", async () => {
    const hasher = new DeterministicHasher();
    const fs = new InMemoryFileAdapter({}, hasher);
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    const manifestRepo = new InMemoryManifestRepository(manifest);
    const useCase = new EnableToolTelemetryUseCase(fs, hasher, manifestRepo, new CapturingLogger());

    const syntheticActivation: TelemetrySettingsFileActivation = {
      kind: "settings-file",
      sectionKey: "otelSettings",
      mergeStrategy: "framework-prime",
      scopes: ["local"],
      defaultScope: "local",
      trackedScopes: [],
      resolveSettingsPath: (_scope, projectRoot) => `${projectRoot}/.synthetic/settings.json`,
      buildEnv: (endpoint) => ({ SYNTHETIC_ENDPOINT: endpoint ?? "" }),
    };

    const result = await useCase.execute({
      toolId: "cursor",
      activation: syntheticActivation,
      projectRoot: PROJECT_ROOT,
      homeDir: HOME_DIR,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      scope: "local",
    });

    expect(result.settingsPath).toBe("/repo/.synthetic/settings.json");
    const written = JSON.parse(fs.getFile(result.settingsPath) ?? "null");
    expect(written.otelSettings.SYNTHETIC_ENDPOINT).toBe(ENDPOINT);
    expect(manifestRepo.getCurrent()?.getMergeFiles("cursor")).toHaveLength(1);
    expect(manifestRepo.getCurrent()?.getMergeFiles("claude")).toEqual([]);
  });

  it("merges with the strategy the activation declares, not one it picks itself", async () => {
    const hasher = new DeterministicHasher();
    const settingsPath = `${PROJECT_ROOT}/.synthetic/settings.json`;
    const fs = new InMemoryFileAdapter(
      { [settingsPath]: JSON.stringify({ otelSettings: { SYNTHETIC_ENDPOINT: "set-by-user" } }) },
      hasher
    );
    const manifest = Manifest.create();
    manifest.addTool("cursor", "1.0.0", []);
    const useCase = new EnableToolTelemetryUseCase(
      fs,
      hasher,
      new InMemoryManifestRepository(manifest),
      new CapturingLogger()
    );

    const userPrimeActivation: TelemetrySettingsFileActivation = {
      kind: "settings-file",
      sectionKey: "otelSettings",
      mergeStrategy: "user-prime",
      scopes: ["local"],
      defaultScope: "local",
      trackedScopes: [],
      resolveSettingsPath: (_scope, projectRoot) => `${projectRoot}/.synthetic/settings.json`,
      buildEnv: (endpoint) => ({ SYNTHETIC_ENDPOINT: endpoint ?? "" }),
    };

    await useCase.execute({
      toolId: "cursor",
      activation: userPrimeActivation,
      projectRoot: PROJECT_ROOT,
      homeDir: HOME_DIR,
      endpoint: ENDPOINT,
      projectId: PROJECT_ID,
      scope: "local",
    });

    const written = JSON.parse(fs.getFile(settingsPath) ?? "null");
    expect(written.otelSettings.SYNTHETIC_ENDPOINT).toBe("set-by-user");
  });
});
