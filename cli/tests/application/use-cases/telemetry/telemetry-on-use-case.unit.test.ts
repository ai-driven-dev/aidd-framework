import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TelemetryProjectScopeRequiresYesError } from "../../../../src/application/errors.js";
import { GitignoreUseCase } from "../../../../src/application/use-cases/shared/gitignore-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/application/use-cases/telemetry/telemetry-on-use-case.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerDelegateScript,
} from "../../../../src/domain/formats/commit-session-trailer.js";
import type { VersionControl } from "../../../../src/domain/ports/version-control.js";
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
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    expect(result.switchChanged).toBe(true);
    const written = JSON.parse(fs.getFile(SWITCH_PATH) ?? "null");
    expect(written.telemetry).toEqual({ enabled: true });
    expect(fs.has(LOCAL_SETTINGS_PATH)).toBe(false);
  });

  it("prints the resolved switch path before writing anything", async () => {
    const { logger, useCase } = buildUseCase();
    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    expect(logger.infoMessages[0]).toBe(`AIDD telemetry switch -> ${SWITCH_PATH}`);
  });

  it("preserves an endpoint already recorded in the switch file — `on` has no opinion on it", async () => {
    const seed = {
      [SWITCH_PATH]: JSON.stringify({
        telemetry: { enabled: false, endpoint: "https://otel.example.com" },
      }),
    };
    const { fs, useCase } = buildUseCase(seed);
    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    const written = JSON.parse(fs.getFile(SWITCH_PATH) as string);
    expect(written.telemetry).toEqual({ enabled: true, endpoint: "https://otel.example.com" });
  });

  it("enabling twice reports the switch unchanged the second time", async () => {
    const { useCase } = buildUseCase();
    const first = await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    const second = await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    expect(first.switchChanged).toBe(true);
    expect(second.switchChanged).toBe(false);
  });
});

describe("TelemetryOnUseCase — the same consent `endpoint --scope project` already demands", () => {
  it("without --yes, refuses and writes nothing, naming the consequence", async () => {
    const { fs, useCase } = buildUseCase();
    await expect(useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: false })).rejects.toThrow(
      TelemetryProjectScopeRequiresYesError
    );
    await expect(useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: false })).rejects.toThrow(
      /everyone who clones/
    );
    expect(fs.has(SWITCH_PATH)).toBe(false);
  });

  it("fires even when the switch is already on — the same unconditional guard `endpoint` uses", async () => {
    const { fs, useCase } = buildUseCase();
    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    expect(fs.has(SWITCH_PATH)).toBe(true);

    await expect(useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: false })).rejects.toThrow(
      TelemetryProjectScopeRequiresYesError
    );
  });

  it("with --yes, writes the switch", async () => {
    const { fs, useCase } = buildUseCase();
    const result = await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    expect(result.switchChanged).toBe(true);
    expect(fs.has(SWITCH_PATH)).toBe(true);
  });
});

describe("TelemetryOnUseCase — making commits joinable to the session that made them", () => {
  /** Records what the use case asked git to do, so the unit tier can hold the decision
   * (install, then say so) apart from the mechanics of writing a hook, which the adapter's
   * own integration suite proves against real repositories. */
  function recordingGit(installed: boolean) {
    const calls: { delegateFile: string; script: string }[] = [];
    const git: VersionControl = {
      ...noGit,
      installCommitMessageDelegate: async (_root, delegateFile, script) => {
        calls.push({ delegateFile, script });
        return installed;
      },
    };
    return { calls, git };
  }

  function useCaseWith(git: VersionControl) {
    const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
    const logger = new CapturingLogger();
    return {
      fs,
      logger,
      useCase: new TelemetryOnUseCase(fs, logger, new GitignoreUseCase(fs), git),
    };
  }

  it("installs the delegate the domain declares, never a script written out a second time", async () => {
    const { calls, git } = recordingGit(true);
    const { useCase } = useCaseWith(git);

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.delegateFile).toBe(SESSION_TRAILER_DELEGATE_FILE);
    expect(calls[0]?.script).toBe(sessionTrailerDelegateScript());
  });

  it("says what it will write into commit messages, and how to undo it", async () => {
    const { git } = recordingGit(true);
    const { logger, useCase } = useCaseWith(git);

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    const said = logger.allMessages.join("\n");
    expect(said).toContain(SESSION_TRAILER_TOKEN);
    expect(said).toContain("aidd telemetry off");
  });

  it("says nothing when it was already installed - a no-op is not news", async () => {
    const { git } = recordingGit(false);
    const { logger, useCase } = useCaseWith(git);

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    expect(logger.allMessages.join("\n")).not.toContain(SESSION_TRAILER_TOKEN);
  });

  it("installs on every successful on, so a project turned on before this is caught up", async () => {
    const { calls, git } = recordingGit(false);
    const { useCase } = useCaseWith(git);

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    expect(calls).toHaveLength(2);
  });
});
