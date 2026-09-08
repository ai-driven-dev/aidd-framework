import { describe, expect, it } from "vitest";
import { GitignoreUseCase } from "../../../../src/contexts/framework/application/gitignore-use-case.js";
import { TelemetryOnUseCase } from "../../../../src/contexts/telemetry/application/telemetry-on-use-case.js";
import { SESSION_TRAILER_TOKEN } from "../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";
import type { VersionControl } from "../../../../src/contexts/telemetry/domain/ports/version-control.js";
import type { HookManager } from "../../../../src/contexts/telemetry/domain/telemetry-setup.js";
import { noGit } from "../../../contexts/framework/application/helpers.js";
import { CapturingLogger } from "../../../helpers/ports/capturing-logger.js";
import { DeterministicHasher } from "../../../helpers/ports/deterministic-hasher.js";
import { InMemoryFileAdapter } from "../../../helpers/ports/in-memory-file-adapter.js";
import { InMemoryTelemetrySink } from "../../../helpers/ports/in-memory-telemetry-sink.js";

const PROJECT_ROOT = "/repo";

/**
 * `on` cannot promise a trailer where lefthook or husky owns `prepare-commit-msg` and
 * regenerates it out from under whatever this CLI appended — the correctness bug this lot
 * exists to fix. `installCommitMessageDelegate` reports which manager, and whether that
 * manager's own config already calls the delegate; this suite holds `on`'s reaction to both
 * bits apart from the git mechanics, which the adapter's own integration suite proves
 * against real repositories.
 */
function managedGit(hookManager: HookManager, managerCallsDelegate: boolean): VersionControl {
  return {
    ...noGit,
    installCommitMessageDelegate: async () => ({
      lineAdded: false,
      hookManager,
      managerCallsDelegate,
    }),
  };
}

function useCaseWith(git: VersionControl) {
  const fs = new InMemoryFileAdapter({}, new DeterministicHasher());
  const logger = new CapturingLogger();
  return {
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

describe("TelemetryOnUseCase — where a manager owns prepare-commit-msg", () => {
  it("prints the job to add and stops promising a trailer, for lefthook", async () => {
    const { logger, useCase } = useCaseWith(managedGit("lefthook", false));

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    const said = logger.allMessages.join("\n");
    expect(said).toContain("lefthook");
    expect(said).toContain("prepare-commit-msg:");
    expect(said).toContain("lefthook.yml");
    expect(said).not.toContain("so what a session cost can be read per commit");
  });

  it("prints the line to add and stops promising a trailer, for husky", async () => {
    const { logger, useCase } = useCaseWith(managedGit("husky", false));

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    const said = logger.allMessages.join("\n");
    expect(said).toContain("husky");
    expect(said).toContain(".husky/prepare-commit-msg");
    expect(said).toContain('"$@"');
    expect(said).not.toContain("so what a session cost can be read per commit");
  });

  it("prints nothing about the trailer once the manager's own config already calls it", async () => {
    const { logger, useCase } = useCaseWith(managedGit("lefthook", true));

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    const said = logger.allMessages.join("\n");
    expect(said).not.toContain(SESSION_TRAILER_TOKEN);
    expect(said).not.toContain("lefthook.yml");
  });

  /**
   * The bug this lot exists to fix, reproduced directly: under lefthook, the append this CLI
   * makes is wiped by the very next regeneration, so the real adapter reports
   * `lineAdded: true` on *every* `on`, never only the first. A use case reading `lineAdded`
   * alone would print the unqualified promise every single time, which is false the moment
   * lefthook regenerates the hook. `hookManager` set alongside `lineAdded: true` is exactly
   * that adapter-observed shape.
   */
  it("reads hookManager over lineAdded, so a lefthook repo never gets the false promise", async () => {
    const { logger, useCase } = useCaseWith(managedGit("lefthook", false));
    // Faking the adapter's own measured shape: `lineAdded` still reports `true` because the
    // hook was rewritten again, but a manager owns it regardless.
    const gitReportingTrueAnyway: VersionControl = {
      ...noGit,
      installCommitMessageDelegate: async () => ({
        lineAdded: true,
        hookManager: "lefthook",
        managerCallsDelegate: false,
      }),
    };
    const { logger: secondLogger, useCase: secondUseCase } = useCaseWith(gitReportingTrueAnyway);

    await useCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });
    await secondUseCase.execute({ projectRoot: PROJECT_ROOT, confirmed: true });

    for (const said of [logger.allMessages.join("\n"), secondLogger.allMessages.join("\n")]) {
      expect(said).not.toContain("so what a session cost can be read per commit");
      expect(said).toContain("lefthook.yml");
    }
  });
});
