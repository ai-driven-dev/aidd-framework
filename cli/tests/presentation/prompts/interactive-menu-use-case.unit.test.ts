import { describe, expect, it, vi } from "vitest";
import type { Prompter } from "../../../src/domain/ports/prompter.js";
import { InteractiveMenuUseCase } from "../../../src/presentation/prompts/menu-use-case.js";
import { buildUnitDeps, initProject } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

type SelectChoice = { name: string; value: string };

function makeQueuedPrompter(
  selectResponses: string[],
  inputResponses: string[] = []
): { prompter: Prompter; selectMock: ReturnType<typeof vi.fn> } {
  let selectIdx = 0;
  let inputIdx = 0;
  const selectMock = vi.fn().mockImplementation((_msg: string, choices: SelectChoice[]) => {
    const val = selectResponses[selectIdx++];
    const match = choices.find((c) => c.value === val);
    if (!match) throw new Error(`No choice with value "${val}"`);
    return Promise.resolve(match.value);
  });
  const inputMock = vi.fn().mockImplementation(() => {
    return Promise.resolve(inputResponses[inputIdx++] ?? "");
  });
  const prompter: Prompter = {
    resolveConflict: vi.fn(),
    resolveConflictBulk: vi.fn(),
    confirm: vi.fn(),
    input: inputMock,
    select: selectMock,
    checkbox: vi.fn(),
  };
  return { prompter, selectMock };
}

describe("interactive menu", () => {
  describe("project without AIDD installed", () => {
    it("prompts to run setup when no manifest exists and user confirms", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const confirmMock = vi.fn().mockResolvedValue(true);
      const prompter: Prompter = {
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
        confirm: confirmMock,
        input: vi.fn(),
        select: vi.fn(),
        checkbox: vi.fn(),
      };

      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

      expect(result.command).toEqual(["setup"]);
      expect(confirmMock).toHaveBeenCalledWith("AIDD not initialized. Run setup now?", true);
    });

    it("exits when no manifest exists and user declines setup", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const prompter: Prompter = {
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
        confirm: vi.fn().mockResolvedValue(false),
        input: vi.fn(),
        select: vi.fn(),
        checkbox: vi.fn(),
      };

      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

      expect(result.command).toEqual(["exit"]);
    });

    it("does not show the full menu before installation", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      const selectMock = vi.fn();
      const prompter: Prompter = {
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
        confirm: vi.fn().mockResolvedValue(false),
        input: vi.fn(),
        select: selectMock,
        checkbox: vi.fn(),
      };
      await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(selectMock).not.toHaveBeenCalled();
    });
  });

  describe("project with AIDD installed", () => {
    it("groups commands by usage area", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter, selectMock } = makeQueuedPrompter(["exit"]);

      await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

      const values = (selectMock.mock.calls[0][1] as SelectChoice[]).map((c) => c.value);
      expect(values).toContain("inspect");
      expect(values).toContain("manage-tools");
      expect(values).toContain("manage-plugins");
      expect(values).toContain("marketplaces");
      expect(values).toContain("maintain");
      expect(values).toContain("system");
      expect(values).toContain("exit");
    });

    it("each group has a description to guide the user", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter, selectMock } = makeQueuedPrompter(["exit"]);

      await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

      const choices = selectMock.mock.calls[0][1] as Array<{ value: string; description?: string }>;
      const groupsWithDescription = choices.filter((c) => c.value !== "exit" && c.description);
      expect(groupsWithDescription.length).toBe(6);
    });

    it("doctor is reachable from the inspect group", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter } = makeQueuedPrompter(["inspect", "doctor"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["doctor"]);
    });

    it("framework install is reachable from the manage-tools group", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter } = makeQueuedPrompter(["manage-tools", "framework-install"], ["claude"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["framework", "install", "--tool", "claude"]);
    });

    it("framework update (all) is reachable from the maintain group", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter } = makeQueuedPrompter(["maintain", "framework-update-maintain"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["framework", "update"]);
    });

    it("CLI update is reachable from the system group", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter } = makeQueuedPrompter(["system", "self-update"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["update"]);
    });

    it("exit is available directly from a group submenu", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter, selectMock } = makeQueuedPrompter(["inspect", "exit"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["exit"]);
      expect(selectMock).toHaveBeenCalledTimes(2);
    });

    it("going back from a group returns to the main menu", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter, selectMock } = makeQueuedPrompter(["inspect", "back", "exit"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["exit"]);
      expect(selectMock).toHaveBeenCalledTimes(3);
    });

    it("internal commands adopt and init are never exposed", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const allValues: string[] = [];
      const selectMock = vi.fn().mockImplementation((_msg: string, choices: SelectChoice[]) => {
        allValues.push(...choices.map((c) => c.value));
        const first = choices.find((c) => c.value !== "exit" && c.value !== "back");
        return Promise.resolve(first?.value ?? "exit");
      });
      const prompter: Prompter = {
        resolveConflict: vi.fn(),
        resolveConflictBulk: vi.fn(),
        confirm: vi.fn(),
        input: vi.fn().mockResolvedValue(""),
        select: selectMock,
        checkbox: vi.fn(),
      };
      await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(allValues).not.toContain("adopt");
      expect(allValues).not.toContain("init");
    });

    it("always returns to root after a command (no breadcrumb saved)", async () => {
      const deps = await buildUnitDeps(PROJECT_ROOT);
      await initProject(deps, PROJECT_ROOT);
      const { prompter } = makeQueuedPrompter(["inspect", "doctor"]);
      const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();
      expect(result.command).toEqual(["doctor"]);
      expect("returnTo" in result).toBe(false);
    });
  });
});
