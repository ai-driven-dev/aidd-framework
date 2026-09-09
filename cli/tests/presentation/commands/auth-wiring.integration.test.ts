import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { AIDD_DIR } from "../../../src/kernel/paths.js";

const login = vi.fn();
const status = vi.fn();
const logout = vi.fn();
const promptSelect = vi.fn();
const promptConfirm = vi.fn();
const promptInput = vi.fn();

vi.mock("../../../src/runtime/wiring/framework.js", () => ({
  createDeps: vi.fn(async () => ({
    credentialStore: { login, status, logout },
    prompter: { select: promptSelect, confirm: promptConfirm, input: promptInput },
  })),
  createMenuDeps: vi.fn(),
}));

const { createDeps } = await import("../../../src/runtime/wiring/framework.js");
const { registerAuthCommand } = await import("../../../src/presentation/commands/auth.js");

const PROJECT_ROOT = process.cwd();

let written: string[] = [];
let errors: string[] = [];

function pretendTerminal(isTTY: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { value: isTTY, configurable: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  written = [];
  errors = [];
  pretendTerminal(false);
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    written.push(String(chunk));
    return true;
  });
  vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
    errors.push(String(chunk));
    return true;
  });
  login.mockResolvedValue({ login: "octocat", level: "user" });
  status.mockResolvedValue({ authenticated: false });
  logout.mockResolvedValue({ found: false });
  promptSelect.mockResolvedValue("project");
  promptConfirm.mockResolvedValue(true);
  promptInput.mockResolvedValue("ghp_asked");
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(...args: string[]): Promise<string[]> {
  const program = new Command();
  program.exitOverride();
  program.option("--verbose");
  registerAuthCommand(program);
  await program.parseAsync(["node", "aidd", "auth", ...args]);
  return written.join("").split("\n").slice(0, -1);
}

function refusing(): MockInstance<typeof process.exit> {
  return vi.spyOn(process, "exit").mockImplementation(() => {
    throw new Error("exited");
  });
}

describe("aidd auth login — the credential it stores", () => {
  it("stores the token it was handed, at the level it was told", async () => {
    login.mockResolvedValue({ login: "octocat", level: "user" });

    expect(await run("login", "--token", "ghp_x", "--level", "user")).toEqual([
      "Authenticated as octocat (user)",
    ]);
    expect(login).toHaveBeenCalledWith({ method: "stored", token: "ghp_x" }, "user");
  });

  it("records a gh-resolved credential as external, storing no token of its own", async () => {
    login.mockResolvedValue({ login: "octocat", level: "project" });

    expect(await run("login", "--gh", "--level", "project")).toEqual([
      "Authenticated as octocat (project)",
    ]);
    expect(login).toHaveBeenCalledWith({ method: "external", provider: "gh" }, "project");
  });
});

describe("aidd auth login — what it asks a person at a terminal", () => {
  it("offers both storage levels, naming where each one lands", async () => {
    pretendTerminal(true);

    await run("login", "--token", "ghp_x");

    expect(promptSelect).toHaveBeenCalledWith("Storage level:", [
      { name: "User (~/.config/aidd/auth.json)", value: "user" },
      { name: `Project (${AIDD_DIR}/auth.json)`, value: "project" },
    ]);
    expect(login).toHaveBeenCalledWith({ method: "stored", token: "ghp_x" }, "project");
  });

  it("falls back to gh when the person has no token of their own", async () => {
    pretendTerminal(true);
    promptConfirm.mockResolvedValue(false);

    await run("login", "--level", "user");

    expect(promptConfirm).toHaveBeenCalledWith("Do you have a Personal Access Token?");
    expect(promptInput).not.toHaveBeenCalled();
    expect(login).toHaveBeenCalledWith({ method: "external", provider: "gh" }, "user");
  });

  it("stores the token the person pasted", async () => {
    pretendTerminal(true);

    await run("login", "--level", "user");

    expect(promptInput).toHaveBeenCalledWith("Paste your GitHub Personal Access Token:");
    expect(login).toHaveBeenCalledWith({ method: "stored", token: "ghp_asked" }, "user");
  });

  it("refuses an empty paste rather than storing a credential of nothing", async () => {
    pretendTerminal(true);
    promptInput.mockResolvedValue("");
    const exit = refusing();

    await expect(run("login", "--level", "user")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: Token cannot be empty.\n");
    expect(exit).toHaveBeenCalledWith(1);
    expect(login).not.toHaveBeenCalled();
  });
});

describe("aidd auth login — what it refuses before building anything", () => {
  it("refuses a run that names two ways of authenticating at once", async () => {
    const exit = refusing();

    await expect(run("login", "--gh", "--token", "ghp_x")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: --gh and --token are mutually exclusive.\n");
    expect(exit).toHaveBeenCalledWith(1);
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses to prompt for a credential off a terminal", async () => {
    refusing();

    await expect(run("login", "--level", "user")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: Use --gh or --token <value> in non-interactive mode.\n");
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses to prompt for a storage level off a terminal", async () => {
    refusing();

    await expect(run("login", "--token", "ghp_x")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: Use --level <user|project> in non-interactive mode.\n");
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });

  it("refuses a level that is neither user nor project", async () => {
    pretendTerminal(true);
    refusing();

    await expect(run("login", "--token", "ghp_x", "--level", "machine")).rejects.toThrow("exited");

    expect(errors[0]).toBe("Error: --level must be 'user' or 'project'.\n");
    expect(vi.mocked(createDeps)).not.toHaveBeenCalled();
  });
});

describe("aidd auth logout", () => {
  it("says nothing was stored when there was nothing to remove", async () => {
    expect(await run("logout")).toEqual(["Not authenticated."]);
    expect(logout).toHaveBeenCalledWith();
  });

  it("names the level it cleared, and the external command still to run", async () => {
    logout.mockResolvedValue({
      found: true,
      level: "user",
      hint: "external-provider-cleanup",
    });

    expect(await run("logout")).toEqual([
      "To fully logout, run the external provider's logout command (e.g. gh auth logout).",
      "Logged out (user)",
    ]);
  });
});

describe("aidd auth logout — a store that refuses", () => {
  it("names the failure on stderr and fails the process", async () => {
    logout.mockRejectedValue(new Error("auth.json is read-only"));
    const exit = refusing();

    await expect(run("logout")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: auth.json is read-only\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd auth status", () => {
  it("says so when nothing authenticates this machine", async () => {
    expect(await run("status")).toEqual(["Not authenticated."]);
    expect(status).toHaveBeenCalledWith();
  });

  it("names who is authenticated and at which level", async () => {
    status.mockResolvedValue({ authenticated: true, login: "octocat", level: "project" });

    expect(await run("status")).toEqual(["Authenticated as octocat (project)"]);
  });
});

describe("aidd auth — how every subcommand builds its graph and reports a failure", () => {
  it.each([["login", "--token", "ghp_x", "--level", "user"], ["logout"], ["status"]])(
    "hands %j this run's verbosity, never an empty option set",
    async (...args) => {
      await run(...args);

      expect(vi.mocked(createDeps)).toHaveBeenCalledWith(
        PROJECT_ROOT,
        { verbose: false },
        expect.anything()
      );
    }
  );

  it("names a failed status read on stderr and fails the process", async () => {
    status.mockRejectedValue(new Error("auth.json is unreadable"));
    const exit = refusing();

    await expect(run("status")).rejects.toThrow("exited");

    expect(errors.join("")).toBe("Error: auth.json is unreadable\n");
    expect(exit).toHaveBeenCalledWith(1);
  });
});

describe("aidd auth — the help surface", () => {
  function authCommand(): Command {
    const program = new Command();
    registerAuthCommand(program);
    const auth = program.commands.find((command) => command.name() === "auth");
    if (auth === undefined) throw new Error("auth command was not registered");
    return auth;
  }

  it("describes the group and every subcommand, in the order they are registered", () => {
    expect(authCommand().description()).toBe("Manage authentication");
    expect(
      authCommand().commands.map((command) => [command.name(), command.description()])
    ).toEqual([
      ["login", "Authenticate with GitHub"],
      ["logout", "Remove stored authentication"],
      ["status", "Show authentication status"],
    ]);
  });

  it("offers login three ways of being told, and asks nothing of logout or status", () => {
    const optionsOf = (name: string): [string, string | undefined][] => {
      const child = authCommand().commands.find((candidate) => candidate.name() === name);
      if (child === undefined) throw new Error(`no subcommand ${name}`);
      return child.options.map((option) => [option.flags, option.description]);
    };

    expect(optionsOf("login")).toEqual([
      ["--gh", "Use GitHub CLI token"],
      ["--token <value>", "Personal access token"],
      ["--level <user|project>", "Storage level (user or project)"],
    ]);
    expect(optionsOf("logout")).toEqual([]);
    expect(optionsOf("status")).toEqual([]);
  });

  it("prints its own help when the group is run with no subcommand", async () => {
    await expect(run()).rejects.toThrow("(outputHelp)");

    expect(written.join("").split("\n")[0]).toBe("Usage: aidd auth [options] [command]");
  });
});
