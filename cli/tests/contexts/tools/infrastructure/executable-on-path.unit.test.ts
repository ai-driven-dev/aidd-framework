import { describe, expect, it } from "vitest";
import {
  candidateExecutableNames,
  type ExecutableLookup,
  hostExecutableLookup,
  resolveExecutableOnPath,
  runsThroughShell,
  windowsCommandLine,
} from "../../../../src/contexts/tools/infrastructure/executable-on-path.js";

function lookup(
  platform: NodeJS.Platform,
  present: readonly string[],
  pathExt?: string
): ExecutableLookup {
  const files = new Set(present);
  return {
    platform,
    pathExt,
    pathEnv: platform === "win32" ? "C:\\tools;C:\\other" : "/usr/local/bin:/usr/bin",
    isExecutable: (path) => files.has(path),
  };
}

describe("finding a tool's own CLI on PATH", () => {
  it("on Windows, a bare command stands for the shims npm and installers actually put there", () => {
    expect(candidateExecutableNames("claude", "win32", ".EXE;.CMD")).toEqual([
      "claude",
      "claude.EXE",
      "claude.exe",
      "claude.CMD",
      "claude.cmd",
    ]);
  });

  it("everywhere else, the bare name is the only spelling", () => {
    expect(candidateExecutableNames("claude", "linux", ".COM;.EXE")).toEqual(["claude"]);
  });

  it("resolves a Windows machine whose PATH holds only claude.cmd", () => {
    const found = resolveExecutableOnPath(
      "claude",
      lookup("win32", ["C:\\other\\claude.cmd"], ".EXE;.CMD")
    );
    expect(found).toBe("C:\\other\\claude.cmd");
  });

  it("falls back to Windows' own default extensions when PATHEXT is unset", () => {
    const found = resolveExecutableOnPath("codex", lookup("win32", ["C:\\tools\\codex.CMD"]));
    expect(found).toBe("C:\\tools\\codex.CMD");
  });

  it("answers nothing when no spelling is executable anywhere on PATH", () => {
    expect(resolveExecutableOnPath("claude", lookup("linux", ["/opt/claude"]))).toBeUndefined();
  });

  it("runs a batch shim through the interpreter and anything else directly", () => {
    expect(runsThroughShell("C:\\tools\\claude.cmd")).toBe(true);
    expect(runsThroughShell("C:\\tools\\claude.BAT")).toBe(true);
    expect(runsThroughShell("C:\\tools\\claude.exe")).toBe(false);
    expect(runsThroughShell("/usr/bin/claude")).toBe(false);
  });

  it("quotes only the arguments the interpreter would otherwise split or interpret", () => {
    expect(
      windowsCommandLine("C:\\tools\\claude.cmd", [
        "plugin",
        "marketplace",
        "add",
        "C:\\Users\\Jane Doe\\.aidd\\cache",
        "--scope",
        "local",
      ])
    ).toBe(
      'C:\\tools\\claude.cmd plugin marketplace add "C:\\Users\\Jane Doe\\.aidd\\cache" --scope local'
    );
  });
});

describe("the shape of a PATH lookup", () => {
  it("skips an empty PATHEXT segment rather than spelling the bare name twice", () => {
    expect(candidateExecutableNames("claude", "win32", ".EXE;;.CMD;")).toEqual([
      "claude",
      "claude.EXE",
      "claude.exe",
      "claude.CMD",
      "claude.cmd",
    ]);
  });

  it("asks about every spelling in every non-empty PATH directory, in order, and nowhere else", () => {
    const asked: string[] = [];
    const found = resolveExecutableOnPath("claude", {
      platform: "linux",
      pathExt: undefined,
      pathEnv: "/usr/local/bin::/opt/bin:",
      isExecutable: (path) => {
        asked.push(path);
        return false;
      },
    });

    expect(found).toBeUndefined();
    expect(asked).toStrictEqual(["/usr/local/bin/claude", "/opt/bin/claude"]);
  });

  it("asks nothing at all when PATH is unset", () => {
    const asked: string[] = [];
    resolveExecutableOnPath("claude", {
      platform: "linux",
      pathExt: undefined,
      pathEnv: undefined,
      isExecutable: (path) => {
        asked.push(path);
        return true;
      },
    });

    expect(asked).toStrictEqual([]);
  });

  it("recognises a shim by its final extension only", () => {
    expect(runsThroughShell("C:\\tools\\claude.cmd.txt")).toBe(false);
  });

  it("quotes an empty argument, doubles an embedded quote, and quotes the interpreter's own characters", () => {
    expect(windowsCommandLine("claude.cmd", ["", 'say "hi"', "100%", "a^b", "x!y", "(p)"])).toBe(
      'claude.cmd "" "say ""hi""" "100%" "a^b" "x!y" "(p)"'
    );
  });

  it("describes this machine, and answers false rather than nothing for a path that is not there", () => {
    const lookup = hostExecutableLookup();

    expect(lookup.platform).toBe(process.platform);
    expect(lookup.pathEnv).toBe(process.env.PATH);
    expect(lookup.pathExt).toBe(process.env.PATHEXT);
    expect(lookup.isExecutable("/definitely/not/here/claude")).toBe(false);
  });
});
