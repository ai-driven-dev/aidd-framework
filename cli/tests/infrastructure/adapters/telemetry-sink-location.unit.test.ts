import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { defaultConfigDir } from "../../../src/infrastructure/adapters/telemetry-sink-adapter.js";

/**
 * Where a person's figures land, pinned on any platform rather than only on a Windows runner.
 *
 * `defaultConfigDir` reads `process.platform` on every call, so stating it here is enough.
 * This pin lived in the plugin's own `sink.cjs` suite until the read path moved into the CLI;
 * that suite is gone, and a rule only `cli / Windows` can check is a rule that regresses in
 * silence for everyone else. The Windows half is a measurement, not a preference: `%APPDATA%`
 * is where a Windows application keeps this, and `.config` is not.
 */
const REPO_ROOT = resolve(process.cwd(), "..");
const PLUGIN_README = join(REPO_ROOT, "plugins", "aidd-telemetry", "README.md");

function withPlatform<T>(platform: NodeJS.Platform, run: () => T): T {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    return run();
  } finally {
    if (original) Object.defineProperty(process, "platform", original);
  }
}

const previousAppData = process.env.APPDATA;
const previousHome = process.env.HOME;
const temporaryHomes: string[] = [];

/** A home with no `.config/aidd/telemetry` in it, so the legacy-data fallback below does not
 * fire. On the machine writing this it does fire, which is the documented behaviour: a
 * machine that already journalled under `.config` keeps landing there rather than losing
 * access to what it wrote. Only a fresh machine gets `%APPDATA%`, and that is what these
 * assertions are about. */
function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), "aidd-sink-location-"));
  temporaryHomes.push(home);
  process.env.HOME = home;
  return home;
}

afterEach(() => {
  if (previousAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = previousAppData;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

describe("where the figures land by default", () => {
  it("a POSIX machine keeps them under the OS user's own .config", () => {
    const home = freshHome();

    expect(withPlatform("linux", defaultConfigDir)).toBe(join(home, ".config", "aidd"));
  });

  it("a fresh Windows machine keeps them under %APPDATA%, never under .config", () => {
    freshHome();
    process.env.APPDATA = join("C:", "Users", "someone", "AppData", "Roaming");

    expect(withPlatform("win32", defaultConfigDir)).toBe(join(process.env.APPDATA, "aidd"));
  });

  it("Windows without APPDATA falls back rather than inventing a path", () => {
    const home = freshHome();
    delete process.env.APPDATA;

    expect(withPlatform("win32", defaultConfigDir)).toBe(join(home, ".config", "aidd"));
  });

  it("the plugin README states the exact default the code writes", () => {
    const documented = join(homedir(), ".config", "aidd", "telemetry").replace(homedir(), "~");
    const text = readFileSync(PLUGIN_README, "utf8");

    expect(text).toContain(documented);
    expect(text).toContain("AIDD_USER_CONFIG_DIR");
  });
});
