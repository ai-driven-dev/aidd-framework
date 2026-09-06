import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/contexts/telemetry/application/telemetry-on-use-case.js";
import {
  SESSION_TRAILER_DELEGATE_FILE,
  SESSION_TRAILER_TOKEN,
  sessionTrailerDelegateScript,
} from "../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import type { VersionControl } from "../../../../src/contexts/telemetry/domain/ports/version-control.js";
import { TelemetryProjectScopeRequiresYesError } from "../../../../src/kernel/errors.js";
import type { FileReader } from "../../../../src/kernel/ports/file-reader.js";
import type { FileWriter } from "../../../../src/kernel/ports/file-writer.js";
import { noGit } from "../../../contexts/framework/application/helpers.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

/** Delegates every read and write to `inner`, except a write to `path`, which throws — a
 * disk-full or permission failure on one file, never on any other. Used to prove that a
 * write failing after the switch has not yet been written must not leave the switch
 * written anyway. */
class ThrowingWriteAdapter implements FileReader, FileWriter {
  constructor(
    private readonly inner: InMemoryFileAdapter,
    private readonly failingPath: string
  ) {}

  readFile(path: string): Promise<string> {
    return this.inner.readFile(path);
  }
  listDirectory(path: string): Promise<string[]> {
    return this.inner.listDirectory(path);
  }
  fileExists(path: string): Promise<boolean> {
    return this.inner.fileExists(path);
  }
  readFileHash(path: string): ReturnType<InMemoryFileAdapter["readFileHash"]> {
    return this.inner.readFileHash(path);
  }
  listFilesRecursive(dirPath: string): Promise<string[]> {
    return this.inner.listFilesRecursive(dirPath);
  }
  isExecutable(path: string): Promise<boolean> {
    return this.inner.isExecutable(path);
  }
  realpath(path: string): Promise<string> {
    return this.inner.realpath(path);
  }
  async writeFile(path: string, content: string): Promise<void> {
    if (path === this.failingPath) throw new Error(`disk full writing ${path}`);
    await this.inner.writeFile(path, content);
  }
  deleteFile(path: string): Promise<void> {
    return this.inner.deleteFile(path);
  }
  createDirectory(path: string): Promise<void> {
    return this.inner.createDirectory(path);
  }
  deleteEmptyDirectories(path: string): Promise<void> {
    return this.inner.deleteEmptyDirectories(path);
  }
  deleteDirectory(path: string): Promise<void> {
    return this.inner.deleteDirectory(path);
  }
  chmodExecutable(path: string): Promise<void> {
    return this.inner.chmodExecutable(path);
  }
}

const PROJECT_ROOT = "/repo";
const SWITCH_PATH = join(PROJECT_ROOT, ".aidd", "config.json");
const LOCAL_SETTINGS_PATH = join(PROJECT_ROOT, ".claude", "settings.local.json");

function buildUseCase(seed: Record<string, string> = {}) {
  const hasher = new DeterministicHasher();
  const fs = new InMemoryFileAdapter(seed, hasher);
  const logger = new CapturingLogger();
  const sink = new InMemoryTelemetrySink();
  const useCase = new TelemetryOnUseCase(fs, logger, new GitignoreUseCase(fs), noGit, sink);
  return { fs, logger, useCase, sink };
}

describe("TelemetryOnUseCase — the switch alone", () => {
  it("refuses when the records directory cannot be written, rather than losing them later", async () => {
    // The one moment a person is asking for measurement is the moment to tell them it
    // cannot be stored. `appendRecord` creates the directory itself, so without this the
    // first failure comes at the first record — long after the decision, and to whoever
    // happens to run `read` rather than to whoever turned it on.
    const { fs, useCase, sink } = buildUseCase();
    sink.unwritable = true;

    await expect(useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true })).rejects.toThrow(
      "not writable"
    );
    expect(fs.has(SWITCH_PATH)).toBe(false);
  });

  it("a gitignore write that fails leaves the switch unwritten, never enabled: true over a half-finished setup", async () => {
    const inner = new InMemoryFileAdapter({}, new DeterministicHasher());
    const fs = new ThrowingWriteAdapter(inner, join(PROJECT_ROOT, ".gitignore"));
    const logger = new CapturingLogger();
    const useCase = new TelemetryOnUseCase(
      fs,
      logger,
      new GitignoreUseCase(fs),
      noGit,
      new InMemoryTelemetrySink()
    );

    await expect(useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true })).rejects.toThrow(
      "disk full"
    );
    expect(inner.has(SWITCH_PATH)).toBe(false);
  });

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
      useCase: new TelemetryOnUseCase(
        fs,
        logger,
        new GitignoreUseCase(fs),
        git,
        new InMemoryTelemetrySink()
      ),
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
