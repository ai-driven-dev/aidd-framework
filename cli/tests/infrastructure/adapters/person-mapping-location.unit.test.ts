import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PersonMappingAdapter } from "../../../src/infrastructure/adapters/person-mapping-adapter.js";

/**
 * Where the person mapping lands, pinned on any platform rather than only on a Windows
 * runner - the same reason `person-identity-location.unit.test.ts` exists for the identity
 * file. `mappingFilePath` is private to the adapter, so this drives it through the one
 * public surface that exposes it: `filePath`.
 *
 * Also pins that the mapping resolves beside `identity.json`, under the same directory
 * `resolveAiddConfigDir` gives the identity adapter - the two must agree, or a person's own
 * declaration and the identifier it maps would silently live under two different homes.
 */
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
const previousUserConfigDir = process.env.AIDD_USER_CONFIG_DIR;
const temporaryHomes: string[] = [];

function freshHome(): string {
  const home = mkdtempSync(join(tmpdir(), "aidd-mapping-location-"));
  temporaryHomes.push(home);
  process.env.HOME = home;
  return home;
}

afterEach(() => {
  if (previousAppData === undefined) delete process.env.APPDATA;
  else process.env.APPDATA = previousAppData;
  if (previousHome === undefined) delete process.env.HOME;
  else process.env.HOME = previousHome;
  if (previousUserConfigDir === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
  else process.env.AIDD_USER_CONFIG_DIR = previousUserConfigDir;
  for (const home of temporaryHomes.splice(0)) rmSync(home, { recursive: true, force: true });
});

function filePath(): string {
  return new PersonMappingAdapter().filePath;
}

describe("where the person mapping lands", () => {
  it("a POSIX machine keeps it under the OS user's own .config, beside identity.json", () => {
    const home = freshHome();

    expect(withPlatform("linux", filePath)).toBe(
      join(home, ".config", "aidd", "person-mapping.json")
    );
  });

  it("a Windows machine keeps it under %APPDATA%, never under .config", () => {
    freshHome();
    process.env.APPDATA = join("C:", "Users", "someone", "AppData", "Roaming");

    expect(withPlatform("win32", filePath)).toBe(
      join(process.env.APPDATA, "aidd", "person-mapping.json")
    );
  });

  it("Windows without APPDATA falls back rather than inventing a path", () => {
    const home = freshHome();
    delete process.env.APPDATA;

    expect(withPlatform("win32", filePath)).toBe(
      join(home, ".config", "aidd", "person-mapping.json")
    );
  });

  it("AIDD_USER_CONFIG_DIR never moves it, on either platform", () => {
    const home = freshHome();
    process.env.AIDD_USER_CONFIG_DIR = join(tmpdir(), "a-repository-or-a-ci-picked-this");

    expect(withPlatform("linux", filePath)).toBe(
      join(home, ".config", "aidd", "person-mapping.json")
    );

    process.env.APPDATA = join("C:", "Users", "someone", "AppData", "Roaming");
    expect(withPlatform("win32", filePath)).toBe(
      join(process.env.APPDATA, "aidd", "person-mapping.json")
    );
  });
});
