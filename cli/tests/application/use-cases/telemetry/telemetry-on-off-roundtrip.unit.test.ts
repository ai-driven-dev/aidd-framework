import { describe, expect, it } from "vitest";
// Side-effect imports: both use-cases resolve tool telemetry stories from the registry.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { EnableToolTelemetryUseCase } from "../../../../src/application/use-cases/telemetry/enable-tool-telemetry-use-case.js";
import { TelemetryOffUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-off-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-on-use-case.js";
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
  const on = new TelemetryOnUseCase(
    fs,
    manifestRepo,
    enableClaude,
    logger,
    async () => "stub/project"
  );
  const off = new TelemetryOffUseCase(fs, manifestRepo, logger);
  return { fs, on, off };
}

async function runOn(on: TelemetryOnUseCase) {
  return on.execute({
    projectRoot: PROJECT_ROOT,
    homeDir: "/home/dev",
    endpoint: ENDPOINT,
    scope: "local",
    confirmProjectScope: false,
  });
}

describe("on then off — the Claude settings file", () => {
  it("restores a pre-existing file byte-identically, unrelated keys included", async () => {
    const before = JSON.stringify(
      { permissions: { allow: ["Bash(ls:*)"] }, model: "opus" },
      null,
      2
    );
    const { fs, on, off } = buildUseCases({ [LOCAL_SETTINGS_PATH]: before });

    await runOn(on);
    expect(fs.getFile(LOCAL_SETTINGS_PATH)).not.toBe(before);

    await off.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.getFile(LOCAL_SETTINGS_PATH)).toBe(before);
  });

  it("removes a file `on` created from nothing — 'before' means absent, and absent it stays", async () => {
    const { fs, on, off } = buildUseCases({});
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);

    await runOn(on);
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(true);

    await off.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);
  });

  it("the switch file is deliberately NOT byte-identical: `on` creates it, `off` sets enabled: false rather than deleting it", async () => {
    const { fs, on, off } = buildUseCases({});
    const switchPath = "/repo/.aidd/config.json";
    expect(fs.has(switchPath)).toBe(false);

    await runOn(on);
    await off.execute({ projectRoot: PROJECT_ROOT });

    expect(fs.has(switchPath)).toBe(true);
    const written = JSON.parse(fs.getFile(switchPath) as string);
    expect(written.telemetry).toEqual({ enabled: false, endpoint: ENDPOINT });
  });
});
