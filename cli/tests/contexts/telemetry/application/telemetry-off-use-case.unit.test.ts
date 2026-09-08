import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TelemetryOffUseCase } from "../../../../src/contexts/telemetry/application/telemetry-off-use-case.js";
import { SESSION_TRAILER_TOKEN } from "../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import type {
  CommitMessageDelegateRemoval,
  VersionControl,
} from "../../../../src/contexts/telemetry/domain/ports/version-control.js";
import { noGit } from "../../../contexts/framework/application/helpers.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { StubTelemetryEvidenceReader } from "../../../helpers/ports/stub-telemetry-evidence-reader.js";

const PROJECT_ROOT = "/repo";
const SWITCH_PATH = join(PROJECT_ROOT, ".aidd", "config.json");

function buildUseCase(seed: Record<string, string> = {}) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(seed, hasher);
  const logger = new CapturingLogger();
  const evidence = new StubTelemetryEvidenceReader();
  const useCase = new TelemetryOffUseCase(fs, logger, evidence, noGit);
  return { fs, logger, evidence, useCase };
}

describe("TelemetryOffUseCase — never on", () => {
  it("succeeds and changes nothing when the project was never on", async () => {
    const { fs, useCase } = buildUseCase();
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.switchChanged).toBe(false);
    expect(fs.listAll()).toHaveLength(0);
  });

  it("prints the resolved switch path even when there is nothing to do", async () => {
    const { logger, useCase } = buildUseCase();
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
    const { fs, useCase } = buildUseCase(seed);
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
    const { fs, useCase } = buildUseCase(seed);
    await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(fs.has(SWITCH_PATH)).toBe(true);
  });

  it("reports unchanged when the switch was already off", async () => {
    const seed = { [SWITCH_PATH]: JSON.stringify({ telemetry: { enabled: false } }) };
    const { useCase } = buildUseCase(seed);
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT });
    expect(result.switchChanged).toBe(false);
  });
});

describe("TelemetryOffUseCase — an endpoint configuration is untouched", () => {
  it("leaves a tool's settings file exactly as `endpoint <url>` wrote it", async () => {
    const settingsPath = join(PROJECT_ROOT, ".claude", "settings.local.json");
    const armed = JSON.stringify(
      { env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_METRICS_EXPORTER: "otlp" } },
      null,
      2
    );
    const seed = {
      [SWITCH_PATH]: JSON.stringify({ telemetry: { enabled: true } }),
      [settingsPath]: armed,
    };
    const { fs, useCase } = buildUseCase(seed);

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(fs.getFile(settingsPath)).toBe(armed);
  });
});

// `off` cannot clear a stale export — the writer that could is gone — but silence is
// exactly the failure this exists to close (see finding 1, review.md). Detection itself
// lives in `TelemetryEvidenceAdapter` (a real settings file, exercised end to end); this
// only proves `off` relays what it is told, by name, on `warn`.
describe("TelemetryOffUseCase — names a leftover export it cannot clear", () => {
  it("warns with the file and the keys still set, when one is found", async () => {
    const { logger, evidence, useCase } = buildUseCase();
    evidence.leftoverExport = [
      {
        path: join(PROJECT_ROOT, ".claude", "settings.local.json"),
        keys: ["CLAUDE_CODE_ENABLE_TELEMETRY", "OTEL_EXPORTER_OTLP_ENDPOINT"],
      },
    ];

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(logger.warnMessages).toHaveLength(1);
    expect(logger.warnMessages[0]).toContain(join(PROJECT_ROOT, ".claude", "settings.local.json"));
    expect(logger.warnMessages[0]).toContain("CLAUDE_CODE_ENABLE_TELEMETRY");
    expect(logger.warnMessages[0]).toContain("OTEL_EXPORTER_OTLP_ENDPOINT");
  });

  it("warns nothing when no leftover export is found", async () => {
    const { logger, useCase } = buildUseCase();

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(logger.warnMessages).toHaveLength(0);
  });
});

describe("TelemetryOffUseCase — taking back what on installed", () => {
  function buildWith(result: CommitMessageDelegateRemoval, seed: Record<string, string> = {}) {
    const fs = new InMemoryFileAdapter(seed, new DeterministicHasher());
    const logger = new CapturingLogger();
    const asked: string[] = [];
    const git: VersionControl = {
      ...noGit,
      removeCommitMessageDelegate: async (_root, delegateFile) => {
        asked.push(delegateFile);
        return result;
      },
    };
    const evidence = new StubTelemetryEvidenceReader();
    return { asked, logger, useCase: new TelemetryOffUseCase(fs, logger, evidence, git) };
  }

  it("asks git to remove the delegate, whatever the switch's previous state was", async () => {
    const { asked, useCase } = buildWith({ removed: true });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(asked).toEqual(["aidd-session-trailer.sh"]);
  });

  it("says new commits carry nothing, and that the old ones keep theirs", async () => {
    const { logger, useCase } = buildWith({ removed: true });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const said = logger.allMessages.join("\n");
    expect(said).toContain(SESSION_TRAILER_TOKEN);
    expect(said).toContain("nothing here rewrites history");
  });

  it("says nothing when there was nothing installed to take back", async () => {
    const { logger, useCase } = buildWith({ removed: false });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(logger.allMessages.join("\n")).not.toContain(SESSION_TRAILER_TOKEN);
  });

  // B-B1: a manager's own hand-added job outlives the delegate script `off` just deleted —
  // that config is committed and shared, not this CLI's to edit on the way out any more than
  // on the way in. Silence here would leave a person reading `lefthook.yml` believing a line
  // that looks live is still doing something.
  it("names the manager job left behind, and says its guard now makes it a no-op", async () => {
    const { logger, useCase } = buildWith({
      removed: true,
      hookManager: "lefthook",
      managerCallsDelegate: true,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    const said = logger.allMessages.join("\n");
    expect(said).toContain("lefthook.yml");
    expect(said).toContain("still calls the delegate");
    expect(said).toMatch(/\[ -f \]|no-op|runs nothing/u);
  });

  it("says nothing about a manager job when its own config never called the delegate", async () => {
    const { logger, useCase } = buildWith({
      removed: true,
      hookManager: "lefthook",
      managerCallsDelegate: false,
    });

    await useCase.execute({ projectRoot: PROJECT_ROOT });

    expect(logger.allMessages.join("\n")).not.toContain("still calls the delegate");
  });
});
