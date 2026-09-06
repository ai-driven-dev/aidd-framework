import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  defaultConfigDir,
  TelemetrySinkAdapter,
} from "../../../../src/contexts/telemetry/infrastructure/telemetry-sink-adapter.js";
import { AuthStorage } from "../../../../src/runtime/auth/auth-storage.js";
import { sandboxedEnv, sinkDirIn } from "../../../e2e/helpers.js";

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
    // Written with forward slashes rather than `join`, which yields `~\\.config\\aidd` on
    // Windows and fails against prose that is the same on every platform. Documentation
    // spells a path one way; only the code has a separator that follows the host.
    const documented = "~/.config/aidd/telemetry";
    const text = readFileSync(PLUGIN_README, "utf8");

    expect(text).toContain(documented);
    // The variable the *code* reads. Pinning the older one instead passed on the strength of
    // a mention that only tells a reader not to use it — which could be deleted without this
    // noticing, leaving the override the adapter honours documented nowhere.
    expect(text).toContain("AIDD_TELEMETRY_DIR");
  });
});

/**
 * The rule an e2e test needs and cannot see: where a *sandboxed* run's figures land.
 *
 * `sandboxedEnv` sets `AIDD_USER_CONFIG_DIR` unconditionally (added to pin the update-check
 * cache, `6478f927`), and the adapter's constructor honours that variable ahead of its own
 * platform-based `defaultConfigDir()` — so a sandboxed run's sink is `.config/aidd/telemetry`
 * under the fake home on every platform, never `%APPDATA%`. A helper that predicted the
 * platform-default path instead agreed with the adapter only by accident on POSIX, where the
 * two paths coincide, and would have disagreed with it on the one job — `cli / Windows` —
 * that could ever tell.
 *
 * Constructs the real adapter under the exact environment `sandboxedEnv` produces, rather
 * than comparing two independent predictions: a guard that never builds the thing it is
 * meant to guard cannot fail when that thing changes.
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
 * The measurement has its own name, and nothing else follows it.
 *
 * The figures are the one thing here meant to leave a machine, so a team shares the
 * directory they land in. Until this, that directory was named by `AIDD_USER_CONFIG_DIR`,
 * which also names where `auth.json` — a GitHub token — is written. Sharing the figures
 * shared the token.
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
    // The two variables mean different things on purpose: this one names the directory the
    // day files sit in, `AIDD_USER_CONFIG_DIR` names the directory above it. Appending
    // "telemetry" to both would make a person who set this one wonder where their figures
    // went.
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
    // The whole point of the split, asserted as the property rather than as the wiring: a
    // person following the documented way to share their figures must not move their
    // credential with them.
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
 * Who may list a person's working days.
 *
 * A day file's content was always 0600. What the directory's own mode decides is the
 * *listing* — which days this person worked, and how many. A default location is theirs
 * alone and is tightened; a location they named themselves is left as they made it, because
 * a shared directory is what naming one is for and locking it to one account would break it.
 *
 * Both halves were uncovered until now, on a boolean this change rewrote.
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
