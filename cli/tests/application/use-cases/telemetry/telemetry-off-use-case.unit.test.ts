import { describe, expect, it } from "vitest";
// Side-effect imports: TelemetryOffUseCase resolves each tool's telemetry story from the
// registry, so every AI tool must be registered for these tests to see it.
import "../../../../src/domain/tools/ai/claude.js";
import "../../../../src/domain/tools/ai/codex.js";
import "../../../../src/domain/tools/ai/copilot.js";
import "../../../../src/domain/tools/ai/cursor.js";
import "../../../../src/domain/tools/ai/opencode.js";
import { TelemetryOffUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-off-use-case.js";
import { Manifest } from "../../../../src/domain/models/manifest.js";
import { copilot } from "../../../../src/domain/tools/ai/copilot.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryManifestRepository } from "../../../helpers/ports/in-memory-manifest-repository.js";

const PROJECT_ROOT = "/repo";
const SWITCH_PATH = "/repo/.aidd/config.json";
const LOCAL_SETTINGS_PATH = "/repo/.claude/settings.local.json";

function buildUseCase(manifest: Manifest | null = null, seed: Record<string, string> = {}) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(seed, hasher);
  const manifestRepo = new InMemoryManifestRepository(manifest);
  const logger = new CapturingLogger();
  const useCase = new TelemetryOffUseCase(fs, manifestRepo, logger);
  return { fs, manifestRepo, logger, useCase };
}

describe("TelemetryOffUseCase — never on", () => {
  it("succeeds and changes nothing when the project was never on", async () => {
    const { fs, useCase } = buildUseCase(null);
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.switchChanged).toBe(false);
    expect(result.removedFiles).toEqual([]);
    expect(fs.listAll()).toHaveLength(0);
  });

  it("prints the resolved switch path even when there is nothing to do", async () => {
    const { logger, useCase } = buildUseCase(null);
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(logger.infoMessages).toContain(`AIDD telemetry switch -> ${SWITCH_PATH}`);
  });
});

describe("TelemetryOffUseCase — the switch", () => {
  it("sets enabled: false, preserving the endpoint the project chose", async () => {
    const seed = {
      [SWITCH_PATH]: JSON.stringify({
        telemetry: { enabled: true, endpoint: "https://otel.example.com" },
      }),
    };
    const { fs, useCase } = buildUseCase(null, seed);
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.switchChanged).toBe(true);
    const written = JSON.parse(fs.getFile(SWITCH_PATH) as string);
    expect(written.telemetry).toEqual({ enabled: false, endpoint: "https://otel.example.com" });
  });

  it("does not delete the switch file — deleting it would lose the endpoint", async () => {
    const seed = {
      [SWITCH_PATH]: JSON.stringify({
        telemetry: { enabled: true, endpoint: "https://otel.example.com" },
      }),
    };
    const { fs, useCase } = buildUseCase(null, seed);
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.has(SWITCH_PATH)).toBe(true);
  });

  it("reports unchanged when the switch was already off", async () => {
    const seed = { [SWITCH_PATH]: JSON.stringify({ telemetry: { enabled: false } }) };
    const { useCase } = buildUseCase(null, seed);
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.switchChanged).toBe(false);
  });
});

describe("TelemetryOffUseCase — undoing what the manifest recorded", () => {
  function manifestWithClaudeEnv(): Manifest {
    const hasher = new DeterministicHasher();
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    manifest.updateToolMergeFiles("claude", [
      {
        relativePath: ".claude/settings.local.json",
        sectionKey: "env",
        entries: {
          CLAUDE_CODE_ENABLE_TELEMETRY: hasher.hash('"1"'),
          OTEL_METRICS_EXPORTER: hasher.hash('"otlp"'),
        },
      },
    ]);
    return manifest;
  }

  it("removes exactly the tracked keys, sparing everything else", async () => {
    const before = JSON.stringify(
      {
        permissions: { allow: ["Bash(ls:*)"] },
        env: {
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_METRICS_EXPORTER: "otlp",
          MY_OWN_VAR: "keep-me",
        },
      },
      null,
      2
    );
    const { fs, useCase, manifestRepo } = buildUseCase(manifestWithClaudeEnv(), {
      [LOCAL_SETTINGS_PATH]: before,
    });

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.removedFiles).toEqual([LOCAL_SETTINGS_PATH]);
    const after = JSON.parse(fs.getFile(LOCAL_SETTINGS_PATH) as string);
    expect(after.env).toEqual({ MY_OWN_VAR: "keep-me" });
    expect(after.permissions).toEqual({ allow: ["Bash(ls:*)"] });
    expect(manifestRepo.getCurrent()?.getMergeFiles("claude")).toEqual([]);
  });

  it("deletes the settings file entirely when it held nothing but our keys", async () => {
    const before = JSON.stringify(
      { env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp" } },
      null,
      2
    );
    const { fs, useCase } = buildUseCase(manifestWithClaudeEnv(), {
      [LOCAL_SETTINGS_PATH]: before,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);
  });

  it("does nothing when the tracked file was already removed by hand, but warns rather than staying silent", async () => {
    const { fs, logger, useCase } = buildUseCase(manifestWithClaudeEnv(), {});
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.removedFiles).toEqual([]);
    expect(fs.listAll()).toHaveLength(0);
    expect(logger.warnMessages.some((m) => m.includes(LOCAL_SETTINGS_PATH))).toBe(true);
  });
});

describe("TelemetryOffUseCase — the inherited --scope user caveat", () => {
  function manifestWithUserScopeEntry(): Manifest {
    const hasher = new DeterministicHasher();
    const manifest = Manifest.create();
    manifest.addTool("claude", "1.0.0", []);
    manifest.updateToolMergeFiles("claude", [
      {
        // Recorded exactly as EnableClaudeTelemetryUseCase records --scope user: a
        // `..`-prefixed traversal from projectRoot to the home directory.
        relativePath: "../home/dev/.claude/settings.json",
        sectionKey: "env",
        entries: { CLAUDE_CODE_ENABLE_TELEMETRY: hasher.hash('"1"') },
      },
    ]);
    return manifest;
  }

  it("resolves and cleans the traversal path when the project hasn't moved", async () => {
    const homeSettingsPath = "/home/dev/.claude/settings.json";
    const before = JSON.stringify(
      { env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1" }, model: "opus" },
      null,
      2
    );
    const { fs, useCase } = buildUseCase(manifestWithUserScopeEntry(), {
      [homeSettingsPath]: before,
    });

    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.removedFiles).toEqual([homeSettingsPath]);
    const after = JSON.parse(fs.getFile(homeSettingsPath) as string);
    // An emptied `env` section vanishes entirely rather than lingering as `{}` (merge.ts's
    // own rule) — `model` is what proves the rest of the file survived.
    expect(after.env).toBeUndefined();
    expect(after.model).toBe("opus");
  });

  it("warns instead of silently forgetting when the traversal resolves nowhere — the project-moved case", async () => {
    const { fs, logger, manifestRepo, useCase } = buildUseCase(manifestWithUserScopeEntry(), {});
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(result.removedFiles).toEqual([]);
    expect(fs.listAll()).toHaveLength(0);
    expect(
      logger.warnMessages.some(
        (m) => m.includes("/home/dev/.claude/settings.json") && m.includes("moved")
      )
    ).toBe(true);
    // Untracked regardless — repeating a resolution that can't succeed helps nobody, but
    // the warning above is what keeps this from being a silent data-loss risk.
    expect(manifestRepo.getCurrent()?.getMergeFiles("claude")).toEqual([]);
  });
});

describe("TelemetryOffUseCase — manual-unset reminders", () => {
  it("derives the reminder from the tool's declared variable, not a literal in this use-case", () => {
    if (copilot.telemetry.kind !== "environment-variable") {
      throw new Error(
        "test fixture assumption broken: copilot's telemetry is environment-variable"
      );
    }
    expect(copilot.telemetry.variable).toBe("COPILOT_OTEL_ENABLED");
  });

  it("prints one reminder per environment-variable tool, unconditionally", async () => {
    const { useCase } = buildUseCase(null);
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.manualUnsetReminders).toEqual([
      "copilot: if you exported COPILOT_OTEL_ENABLED yourself, unset it by hand.",
    ]);
  });
});
