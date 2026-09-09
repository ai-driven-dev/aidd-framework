import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultConfigDir,
  TelemetrySinkAdapter,
} from "../../../../src/contexts/telemetry/infrastructure/telemetry-sink-adapter.js";
import { AuthStorage } from "../../../../src/runtime/auth/auth-storage.js";
import { sandboxedEnv, sinkDirIn } from "../../../e2e/helpers.js";
import { REPOSITORY_ROOT } from "../../../helpers/repository-root.js";

/**
 * `defaultConfigDir` reads `process.platform` on every call, so faking it here pins the rule
 * on any machine. `%APPDATA%` is where a Windows application keeps this, `.config` is not.
 */
const PLUGIN_README = join(REPOSITORY_ROOT, "plugins", "aidd-telemetry", "README.md");

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

/** A home with no `.config/aidd/telemetry`, so the legacy-data fallback does not fire: a
 * machine that already journalled there keeps landing there, only a fresh one gets `%APPDATA%`. */
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
    // Forward slashes rather than `join`, which yields `~\\.config\\aidd` on Windows: the
    // prose reads the same on every platform, only the code follows the host's separator.
    const documented = "~/.config/aidd/telemetry";
    const text = readFileSync(PLUGIN_README, "utf8");

    expect(text).toContain(documented);
    // The variable the adapter honours, not the older one a reader is only told to avoid.
    expect(text).toContain("AIDD_TELEMETRY_DIR");
  });
});

/**
 * `sandboxedEnv` sets `AIDD_USER_CONFIG_DIR` and the adapter honours it ahead of
 * `defaultConfigDir()`, so a sandboxed sink sits under the fake home on every platform.
 */
describe("a sandboxed run's sink, agreed between the helper and the adapter", () => {
  const previousUserConfigDir = process.env.AIDD_USER_CONFIG_DIR;

  afterEach(() => {
    if (previousUserConfigDir === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
    else process.env.AIDD_USER_CONFIG_DIR = previousUserConfigDir;
  });

  for (const platform of ["linux", "win32"] as const) {
    it(`agrees on ${platform}, whichever platform this suite runs on`, () => {
      const home = freshHome();
      const env = sandboxedEnv(home);
      const previousPlatformAppData = process.env.APPDATA;
      process.env.APPDATA = env.APPDATA;
      process.env.AIDD_USER_CONFIG_DIR = env.AIDD_USER_CONFIG_DIR;
      try {
        const fromAdapter = withPlatform(platform, () => new TelemetrySinkAdapter().rootDir);
        const fromHelper = withPlatform(platform, () => sinkDirIn(home));

        expect(fromHelper).toBe(fromAdapter);
      } finally {
        if (previousPlatformAppData === undefined) delete process.env.APPDATA;
        else process.env.APPDATA = previousPlatformAppData;
      }
    });
  }
});

/**
 * `AIDD_USER_CONFIG_DIR` also names where `auth.json` — a GitHub token — is written, so
 * sharing the figures through it shared the token. The measurement has its own name.
 */
describe("where the figures land, and what does not follow them there", () => {
  const previousTelemetryDir = process.env.AIDD_TELEMETRY_DIR;
  const previousUserConfigDir = process.env.AIDD_USER_CONFIG_DIR;

  afterEach(() => {
    for (const [key, value] of [
      ["AIDD_TELEMETRY_DIR", previousTelemetryDir],
      ["AIDD_USER_CONFIG_DIR", previousUserConfigDir],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("puts the figures exactly where AIDD_TELEMETRY_DIR names, not in a subdirectory of it", () => {
    // This variable names the directory the day files sit in; `AIDD_USER_CONFIG_DIR` names
    // the directory above it.
    const shared = mkdtempSync(join(tmpdir(), "aidd-shared-figures-"));
    try {
      process.env.AIDD_TELEMETRY_DIR = shared;
      delete process.env.AIDD_USER_CONFIG_DIR;

      expect(new TelemetrySinkAdapter().rootDir).toBe(shared);
    } finally {
      rmSync(shared, { recursive: true, force: true });
    }
  });

  it("leaves the token where it was when the figures are shared", () => {
    const shared = mkdtempSync(join(tmpdir(), "aidd-shared-figures-"));
    const home = mkdtempSync(join(tmpdir(), "aidd-home-"));
    try {
      delete process.env.AIDD_USER_CONFIG_DIR;
      const tokenBefore = new AuthStorage().userConfigPath();

      process.env.AIDD_TELEMETRY_DIR = shared;

      expect(new TelemetrySinkAdapter().rootDir).toBe(shared);
      expect(new AuthStorage().userConfigPath()).toBe(tokenBefore);
    } finally {
      rmSync(shared, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("still honours the older variable, so a setup that predates the split keeps working", () => {
    const older = mkdtempSync(join(tmpdir(), "aidd-legacy-config-"));
    try {
      delete process.env.AIDD_TELEMETRY_DIR;
      process.env.AIDD_USER_CONFIG_DIR = older;

      expect(new TelemetrySinkAdapter().rootDir).toBe(join(older, "telemetry"));
    } finally {
      rmSync(older, { recursive: true, force: true });
    }
  });

  it("prefers the name given to the figures when both are set", () => {
    const shared = mkdtempSync(join(tmpdir(), "aidd-shared-figures-"));
    const older = mkdtempSync(join(tmpdir(), "aidd-legacy-config-"));
    try {
      process.env.AIDD_TELEMETRY_DIR = shared;
      process.env.AIDD_USER_CONFIG_DIR = older;

      expect(new TelemetrySinkAdapter().rootDir).toBe(shared);
    } finally {
      rmSync(shared, { recursive: true, force: true });
      rmSync(older, { recursive: true, force: true });
    }
  });
});

/**
 * The directory's mode decides who may list a person's working days. A default location is
 * tightened; one they named themselves is left as made, since sharing is what naming it is for.
 */
describe("who may list the days a person worked", () => {
  const previousTelemetryDir = process.env.AIDD_TELEMETRY_DIR;
  const previousUserConfigDir = process.env.AIDD_USER_CONFIG_DIR;
  const previousHome = process.env.HOME;

  afterEach(() => {
    for (const [key, value] of [
      ["AIDD_TELEMETRY_DIR", previousTelemetryDir],
      ["AIDD_USER_CONFIG_DIR", previousUserConfigDir],
      ["HOME", previousHome],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function modeOf(dir: string): string {
    return (statSync(dir).mode & 0o777).toString(8);
  }

  it.skipIf(process.platform === "win32")(
    "tightens a default location to this person alone",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "aidd-tighten-home-"));
      try {
        delete process.env.AIDD_TELEMETRY_DIR;
        delete process.env.AIDD_USER_CONFIG_DIR;
        process.env.HOME = home;

        const sink = new TelemetrySinkAdapter();
        await sink.ensureWritable();

        expect(modeOf(sink.rootDir)).toBe("700");
      } finally {
        rmSync(home, { recursive: true, force: true });
      }
    }
  );

  it.skipIf(process.platform === "win32")(
    "leaves a location a person named themselves exactly as they made it",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "aidd-tighten-home-"));
      const shared = join(mkdtempSync(join(tmpdir(), "aidd-tighten-shared-")), "figures");
      try {
        process.env.HOME = home;
        delete process.env.AIDD_USER_CONFIG_DIR;
        process.env.AIDD_TELEMETRY_DIR = shared;
        mkdirSync(shared, { recursive: true });
        chmodSync(shared, 0o755);

        const sink = new TelemetrySinkAdapter();
        await sink.ensureWritable();

        // Untouched: a directory a team shares must stay listable by the team.
        expect(modeOf(shared)).toBe("755");
      } finally {
        rmSync(home, { recursive: true, force: true });
        rmSync(shared, { recursive: true, force: true });
      }
    }
  );
});
