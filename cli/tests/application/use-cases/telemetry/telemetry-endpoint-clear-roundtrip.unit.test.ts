import { describe, expect, it } from "vitest";
// Side-effect imports: both use-cases resolve tool telemetry stories from the registry.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { EnableToolTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/enable-tool-telemetry-use-case.js";
import { TelemetryEndpointClearUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-endpoint-clear-use-case.js";
import { TelemetryEndpointUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-endpoint-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/repo";
const LOCAL_SETTINGS_PATH = "/repo/.claude/settings.local.json";
const ENDPOINT = "https://otel.example.com";

function buildUseCases(seed: Record<string, string> = {}) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(seed, hasher);
  const manifest = Manifest.create();
  manifest.addTool("claude", "1.0.0", []);
  const manifestRepo = new InMemoryManifestRepository(manifest);
  const logger = new CapturingLogger();
  const enableClaude = new EnableToolTelemetryUseCase(fs, hasher, manifestRepo, logger);
  const endpoint = new TelemetryEndpointUseCase(
    manifestRepo,
    enableClaude,
    logger,
    async () => "stub/project"
  );
  const clear = new TelemetryEndpointClearUseCase(fs, manifestRepo, logger);
  return { fs, endpoint, clear };
}

async function runEndpoint(endpoint: TelemetryEndpointUseCase) {
  return endpoint.execute({
    projectRoot: PROJECT_ROOT,
    homeDir: "/home/dev",
    endpoint: ENDPOINT,
    scope: "local",
    confirmProjectScope: false,
  });
}

describe("endpoint then endpoint clear — the Claude settings file", () => {
  it("restores a pre-existing file byte-identically, unrelated keys included", async () => {
    const before = JSON.stringify(
      { permissions: { allow: ["Bash(ls:*)"] }, model: "opus" },
      null,
      2
    );
    const { fs, endpoint, clear } = buildUseCases({ [LOCAL_SETTINGS_PATH]: before });

    await runEndpoint(endpoint);
    expect(fs.getFile(LOCAL_SETTINGS_PATH)).not.toBe(before);

    await clear.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.getFile(LOCAL_SETTINGS_PATH)).toBe(before);
  });

  it("removes a file `endpoint` created from nothing — 'before' means absent, and absent it stays", async () => {
    const { fs, endpoint, clear } = buildUseCases({});
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);

    await runEndpoint(endpoint);
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(true);

    await clear.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);
  });
});
