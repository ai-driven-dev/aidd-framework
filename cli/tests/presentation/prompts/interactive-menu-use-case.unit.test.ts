import { describe, expect, it, vi } from "vitest";
import type { Prompter } from "../../../src/kernel/ports/prompter.js";
import { InteractiveMenuUseCase } from "../../../src/presentation/prompts/menu-use-case.js";
import { buildUnitDeps, initProject } from "../../helpers/ports/build-unit-deps.js";

const PROJECT_ROOT = "/test-project";

type SelectChoice = { name: string; value: string };

function makeQueuedPrompter(
  selectResponses: string[],
  inputResponses: string[] = []
): {
  prompter: Prompter;
  selectMock: ReturnType<typeof vi.fn>;
  inputMock: ReturnType<typeof vi.fn>;
} {
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
  return { prompter, selectMock, inputMock };
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

const BACK_AND_EXIT = [
  { name: "← Back", value: "back" },
  { name: "Exit", value: "exit" },
];

async function choicesAt(path: string[]): Promise<[string, unknown]> {
  const deps = await buildUnitDeps(PROJECT_ROOT);
  await initProject(deps, PROJECT_ROOT);
  const { prompter, selectMock } = makeQueuedPrompter([...path, "exit"]);

  await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

  const call = selectMock.mock.calls[path.length];
  return [call[0] as string, call[1]];
}

describe("interactive menu — the rows each level offers", () => {
  it("offers six groups and an exit at the root, each named and described", async () => {
    expect(await choicesAt([])).toEqual([
      "What would you like to do?",
      [
        {
          name: "Inspect",
          value: "inspect",
          description: "Check status, health and installed items",
        },
        {
          name: "Manage tools",
          value: "manage-tools",
          description: "Install, remove and update AI or IDE tools",
        },
        {
          name: "Manage plugins",
          value: "manage-plugins",
          description: "Browse, install and manage AI tool plugins",
        },
        {
          name: "Marketplaces",
          value: "marketplaces",
          description: "Manage plugin marketplace registrations",
        },
        {
          name: "Maintain & repair",
          value: "maintain",
          description: "Update tools, sync tracked files, and clean everything",
        },
        { name: "System", value: "system", description: "CLI update and authentication" },
        { name: "Exit", value: "exit" },
      ],
    ]);
  });

  it("offers no way back from the root, only out", async () => {
    const [, choices] = await choicesAt([]);

    expect((choices as { value: string }[]).map((choice) => choice.value)).not.toContain("back");
  });

  it("offers the three inspect commands under the group's own name", async () => {
    expect(await choicesAt(["inspect"])).toEqual([
      "Inspect",
      [
        {
          name: "Doctor",
          value: "doctor",
          description: "Tool inventory, drift, plugins, and structural health",
        },
        {
          name: "Doctor (one tool)",
          value: "doctor-tool",
          description: "Scope the report to a single AI or IDE tool",
        },
        {
          name: "Plugins",
          value: "plugin-list",
          description: "Show installed plugins per tool",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the four tool commands under Manage tools", async () => {
    expect(await choicesAt(["manage-tools"])).toEqual([
      "Manage tools",
      [
        { name: "Install", value: "framework-install", description: "Add a tool to this project" },
        { name: "Remove", value: "framework-remove", description: "Remove an installed tool" },
        {
          name: "Update all",
          value: "framework-update-all",
          description: "Re-install every installed tool's configs from bundled assets",
        },
        {
          name: "Update one",
          value: "framework-update-one",
          description: "Re-install one tool's configs from bundled assets",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the six plugin commands under Manage plugins", async () => {
    expect(await choicesAt(["manage-plugins"])).toEqual([
      "Manage plugins",
      [
        {
          name: "Install plugin",
          value: "plugin-install",
          description: "Install a plugin by name, local path, or interactive pick",
        },
        {
          name: "Search",
          value: "plugin-search",
          description: "Search plugins across all registered marketplaces",
        },
        {
          name: "Update",
          value: "plugin-update",
          description: "Update all installed plugins to latest version",
        },
        { name: "Remove", value: "plugin-remove", description: "Remove an installed plugin" },
        {
          name: "List",
          value: "plugin-list-2",
          description: "Show all installed plugins per tool",
        },
        {
          name: "Doctor",
          value: "plugin-doctor",
          description: "Check one plugin's installation health",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the five marketplace commands under Marketplaces", async () => {
    expect(await choicesAt(["marketplaces"])).toEqual([
      "Marketplaces",
      [
        {
          name: "List",
          value: "marketplace-list",
          description: "Show all registered marketplaces",
        },
        {
          name: "Add",
          value: "marketplace-add",
          description: "Register a new plugin marketplace",
        },
        {
          name: "Refresh",
          value: "marketplace-refresh",
          description: "Refresh all registered marketplaces",
        },
        { name: "Remove", value: "marketplace-remove", description: "Unregister a marketplace" },
        {
          name: "Check freshness",
          value: "marketplace-check",
          description: "Report stale marketplaces",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the three repair commands under Maintain & repair", async () => {
    expect(await choicesAt(["maintain"])).toEqual([
      "Maintain & repair",
      [
        {
          name: "Update all tools",
          value: "framework-update-maintain",
          description: "Re-install every installed tool's configs from bundled assets",
        },
        {
          name: "Sync everything",
          value: "sync-all",
          description:
            "Regenerate tracked files across all installed tools, driven by the manifest",
        },
        {
          name: "Clean (nuke .aidd)",
          value: "clean",
          description: "Remove all AIDD-managed files from this project",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the CLI's own update and a nested authentication branch under System", async () => {
    expect(await choicesAt(["system"])).toEqual([
      "System",
      [
        {
          name: "Update CLI",
          value: "self-update",
          description: "Update the AIDD CLI binary itself (bare `update`)",
        },
        {
          name: "Authentication",
          value: "auth",
          description: "Manage authentication credentials",
        },
        ...BACK_AND_EXIT,
      ],
    ]);
  });

  it("offers the three authentication commands two levels down", async () => {
    expect(await choicesAt(["system", "auth"])).toEqual([
      "Authentication",
      [
        {
          name: "Status",
          value: "auth-status",
          description: "Show current authentication status",
        },
        { name: "Login", value: "auth-login", description: "Authenticate with your credentials" },
        { name: "Logout", value: "auth-logout", description: "Remove stored credentials" },
        ...BACK_AND_EXIT,
      ],
    ]);
  });
});

describe("interactive menu — the command each pick hands over", () => {
  async function commandFor(path: string[], input?: string): Promise<string[]> {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const { prompter } = makeQueuedPrompter(path, input === undefined ? [] : [input]);

    const result = await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

    return result.command;
  }

  it.each([
    [["inspect", "doctor"], ["doctor"]],
    [
      ["inspect", "plugin-list"],
      ["plugin", "list"],
    ],
    [
      ["manage-tools", "framework-update-all"],
      ["framework", "update"],
    ],
    [
      ["manage-plugins", "plugin-update"],
      ["plugin", "update"],
    ],
    [
      ["manage-plugins", "plugin-list-2"],
      ["plugin", "list"],
    ],
    [
      ["marketplaces", "marketplace-list"],
      ["marketplace", "list"],
    ],
    [
      ["marketplaces", "marketplace-add"],
      ["marketplace", "add"],
    ],
    [
      ["marketplaces", "marketplace-refresh"],
      ["marketplace", "refresh"],
    ],
    [
      ["marketplaces", "marketplace-check"],
      ["marketplace", "check"],
    ],
    [
      ["maintain", "framework-update-maintain"],
      ["framework", "update"],
    ],
    [["maintain", "sync-all"], ["sync"]],
    [["maintain", "clean"], ["clean"]],
    [["system", "self-update"], ["update"]],
    [
      ["system", "auth", "auth-status"],
      ["auth", "status"],
    ],
    [
      ["system", "auth", "auth-login"],
      ["auth", "login"],
    ],
    [
      ["system", "auth", "auth-logout"],
      ["auth", "logout"],
    ],
  ])("hands %j over as %j, asking nothing", async (path, command) => {
    expect(await commandFor(path)).toEqual(command);
  });

  it.each([
    [["inspect", "doctor-tool"], "claude", ["doctor", "--tool", "claude"]],
    [["manage-tools", "framework-install"], "cursor", ["framework", "install", "--tool", "cursor"]],
    [["manage-tools", "framework-remove"], "codex", ["framework", "remove", "--tool", "codex"]],
    [
      ["manage-tools", "framework-update-one"],
      "vscode",
      ["framework", "update", "--tool", "vscode"],
    ],
    [["manage-plugins", "plugin-install"], "aidd-dev", ["plugin", "install", "aidd-dev"]],
    [["manage-plugins", "plugin-search"], "review", ["plugin", "search", "review"]],
    [["manage-plugins", "plugin-remove"], "aidd-dev", ["plugin", "remove", "aidd-dev"]],
    [["manage-plugins", "plugin-doctor"], "aidd-dev", ["doctor", "--plugin", "aidd-dev"]],
    [
      ["marketplaces", "marketplace-remove"],
      "aidd-framework",
      ["marketplace", "remove", "aidd-framework"],
    ],
  ])("hands %j over with what it asked for, as %j", async (path, answer, command) => {
    expect(await commandFor(path, answer)).toEqual(command);
  });

  it.each([
    [["inspect", "doctor-tool"], "Tool (e.g. claude, cursor, copilot, codex, opencode, vscode)"],
    [
      ["manage-tools", "framework-install"],
      "Tool (e.g. claude, cursor, copilot, codex, opencode, vscode)",
    ],
    [["manage-tools", "framework-remove"], "Tool to remove"],
    [["manage-tools", "framework-update-one"], "Tool to update"],
    [
      ["manage-plugins", "plugin-install"],
      "Plugin name, path, or leave empty for interactive pick",
    ],
    [["manage-plugins", "plugin-search"], "Search query"],
    [["manage-plugins", "plugin-remove"], "Plugin name to remove"],
    [["manage-plugins", "plugin-doctor"], "Plugin name"],
    [["marketplaces", "marketplace-remove"], "Marketplace name to remove"],
  ])("asks %j for its argument by name: %s", async (path, question) => {
    const deps = await buildUnitDeps(PROJECT_ROOT);
    await initProject(deps, PROJECT_ROOT);
    const { prompter, inputMock } = makeQueuedPrompter(path, ["x"]);

    await new InteractiveMenuUseCase(deps.manifestRepo, prompter).execute();

    expect(inputMock).toHaveBeenCalledWith(question);
  });
});
