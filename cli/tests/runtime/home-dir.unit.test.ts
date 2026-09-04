import { describe, expect, it } from "vitest";
import { resolveHomeDir } from "../../src/kernel/reading/home-dir.js";

describe("resolveHomeDir", () => {
  // `os.homedir()` never reads `HOME` on Windows — it reads `USERPROFILE` instead
  // (https://nodejs.org/api/os.html#oshomedir) — so a bare `homedir()` call silently drops
  // a sandboxed `HOME` there. Spelled with backslashes and no `process.platform` branch:
  // this must fail on every platform if `resolveHomeDir` regresses to a bare `homedir()`
  // call, not just on a real Windows machine.
  it("prefers HOME over the OS-reported home directory", () => {
    const env = { HOME: "C:\\sandbox\\home" } as NodeJS.ProcessEnv;
    const osHomedir = () => "C:\\Users\\runneradmin";

    expect(resolveHomeDir(env, osHomedir)).toBe("C:\\sandbox\\home");
  });

  it("falls back to the OS-reported home directory when HOME is unset", () => {
    const env = {} as NodeJS.ProcessEnv;
    const osHomedir = () => "C:\\Users\\runneradmin";

    expect(resolveHomeDir(env, osHomedir)).toBe("C:\\Users\\runneradmin");
  });

  it("falls back when HOME is set but empty", () => {
    const env = { HOME: "" } as NodeJS.ProcessEnv;
    const osHomedir = () => "C:\\Users\\runneradmin";

    expect(resolveHomeDir(env, osHomedir)).toBe("C:\\Users\\runneradmin");
  });
});
