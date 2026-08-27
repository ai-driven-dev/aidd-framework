import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitignoreUseCase } from "../../../../src/application/use-cases/shared/gitignore-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-on-use-case.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { noGit } from "../helpers.js";

const PROJECT_ROOT = "/repo";
const SWITCH_PATH = join(PROJECT_ROOT, ".aidd", "config.json");
const LOCAL_SETTINGS_PATH = join(PROJECT_ROOT, ".claude", "settings.local.json");

function buildUseCase(seed: Record<string, string> = {}) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(seed, hasher);
  const logger = new CapturingLogger();
  const useCase = new TelemetryOnUseCase(fs, logger, new GitignoreUseCase(fs), noGit);
  return { fs, logger, useCase };
}

describe("TelemetryOnUseCase — the switch alone", () => {
  it("succeeds with no endpoint anywhere, and writes no tool's settings file", async () => {
    const { fs, useCase } = buildUseCase();
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.switchChanged).toBe(true);
    const written = JSON.parse(fs.getFile(SWITCH_PATH) ?? "null");
    expect(written.telemetry).toEqual({ enabled: true });
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);
  });

  it("prints the resolved switch path before writing anything", async () => {
    const { logger, useCase } = buildUseCase();
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(logger.infoMessages[0]).toBe(`AIDD telemetry switch -> ${SWITCH_PATH}`);
  });

  it("preserves an endpoint already recorded in the switch file — `on` has no opinion on it", async () => {
    const seed = {
      [SWITCH_PATH]: JSON.stringify({
        telemetry: { enabled: false, endpoint: "https://otel.example.com" },
      }),
    };
    const { fs, useCase } = buildUseCase(seed);
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    const written = JSON.parse(fs.getFile(SWITCH_PATH) as string);
    expect(written.telemetry).toEqual({ enabled: true, endpoint: "https://otel.example.com" });
  });

  it("enabling twice reports the switch unchanged the second time", async () => {
    const { useCase } = buildUseCase();
    const first = await useCase.execute({ projectRoot: PROJECT_ROOT });
    const second = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(first.switchChanged).toBe(true);
    expect(second.switchChanged).toBe(false);
  });
});
