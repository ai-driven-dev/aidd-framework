import { execFileSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/infrastructure/git-environment.js";
import { createTestEnv, gitInit, runCli } from "./helpers.js";

/**
 * `aidd telemetry check` — the local route alone (hook fired, session journalled, tool
 * files readable, records join). The export route (export configured, identifier
 * joinable) was deleted in "one route, and every sentence about it true"
 * (aidd_docs/tasks/2026_08/2026_08_28_one-route-that-is-true/): the OTLP export writer,
 * and every diagnostic claim that graded it, are gone — a healthy install has nothing
 * left to grade but the route that actually produces a record. An earlier phase pinned
 * this same suite's claims against the plugin's own `telemetry-check.cjs` while both
 * existed; that script is long deleted (`02-check` calls `aidd telemetry check` instead),
 * so this covers the gate and edge cases without a second process to compare against.
 */
const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const REPO_ROOT = resolve(process.cwd(), "..");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CLAUDE_RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

async function writeSwitch(projectDir: string, enabled: boolean): Promise<void> {
  await mkdir(join(projectDir, ".aidd"), { recursive: true });
  await writeFile(
    join(projectDir, ".aidd", "config.json"),
    JSON.stringify({ telemetry: { enabled } })
  );
}

async function seedJournal(
  projectDir: string,
  runId: string,
  vendorId: string,
  sessionStartAt: string,
  turnEndAt: string
): Promise<void> {
  const runsDir = join(projectDir, "aidd_docs", "runs");
  await mkdir(runsDir, { recursive: true });
  const line = (value: unknown) => `${JSON.stringify(value)}\n`;
  await writeFile(
    join(runsDir, `${runId}__${vendorId}.jsonl`),
    line({
      type: "session_start",
      at: sessionStartAt,
      run_id: runId,
      tool: "claude",
      vendor_id: vendorId,
      project_id: "acme-widgets",
    }) + line({ type: "turn_end", at: turnEndAt })
  );
}

async function seedTornRunFile(projectDir: string): Promise<void> {
  const runsDir = join(projectDir, "aidd_docs", "runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    join(runsDir, `${CLAUDE_RUN_ID}__${CLAUDE_SESSION}.jsonl`),
    '{"type":"session_start","at":"2026-08-05T19:0'
  );
}

async function seedUnrecognisedPayload(projectDir: string, at: string): Promise<void> {
  const runsDir = join(projectDir, "aidd_docs", "runs");
  await mkdir(runsDir, { recursive: true });
  await writeFile(
    join(runsDir, "_unrecognised.jsonl"),
    `${JSON.stringify({ type: "unrecognised_payload", at })}\n`
  );
}

/** `~/.codex/config.toml`'s own trust table shape, for one event name. Approving a hook
 * under `eventName` and then checking under a *different* one — the "renamed event" edge
 * case — is exactly why this takes the event name as a parameter rather than hardcoding
 * `session_start`. */
async function writeCodexHookTrust(fakeHome: string, eventName: string): Promise<void> {
  await mkdir(join(fakeHome, ".codex"), { recursive: true });
  await writeFile(
    join(fakeHome, ".codex", "config.toml"),
    `[hooks.state."aidd-telemetry@ai-driven-dev/framework:hooks/hooks.json:${eventName}:0:0"]
trusted_hash = "deadbeef"
`
  );
}

/** Every claim line the union covers — all four, in the fixed order `diagnoseTelemetryClaims`
 * prints in — never the "not covered" lines after them, whose count depends on which tools
 * this machine happens to have wired. */
function allClaimLines(stdout: string): string[] {
  return stdout.split("\n").slice(0, 4);
}

describe("aidd telemetry check — the journey and its edge cases", () => {
  it("stops at the switch before judging anything else", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-switch-off");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, false);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/measurement is off/u);
      expect(result.stdout).not.toContain("hook fired");
    } finally {
      await cleanup();
    }
  });

  it("names a non-repository, and never blames the hook", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-not-a-repo");
    try {
      await writeSwitch(projectDir, true);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/not a git repository/u);
      expect(result.stdout).not.toMatch(/never been observed firing/u);
    } finally {
      await cleanup();
    }
  });

  it("names the hook never firing when measurement is on and no run file appears", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-never-fired");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+no run file/u);
      expect(result.stdout).toMatch(/never been observed firing/u);
      // "Nothing has run yet" is not "everything is broken": with no journal at all, the
      // three claims that read from it have no material to judge, and say so - never a
      // cascade of failures downstream of the one genuine one.
      expect(result.stdout).toMatch(/session journalled\s+--/u);
      expect(result.stdout).toMatch(/tool files readable\s+--/u);
      expect(result.stdout).toMatch(/records join\s+--/u);
    } finally {
      await cleanup();
    }
  });

  it("names an unrecognised payload, not a hook that never ran", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-unrecognised");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await seedUnrecognisedPayload(projectDir, "2026-08-22T09:00:00Z");

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/matched no known host/u);
      expect(result.stdout).toContain("2026-08-22T09:00:00Z");
    } finally {
      await cleanup();
    }
  });

  it("names the hook never firing, not an unrecognised payload, for a run file torn before session_start ever parsed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-torn");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await seedTornRunFile(projectDir);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/never been observed firing/u);
      expect(result.stdout).not.toMatch(/matched no known host/u);
    } finally {
      await cleanup();
    }
  });

  it("settles every claim — none is ever printed as not yet judged", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-settled");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await cp(LOCAL_COST_FIXTURES, fakeHome, { recursive: true });
      await seedJournal(
        projectDir,
        CLAUDE_RUN_ID,
        CLAUDE_SESSION,
        "2026-08-05T19:00:00Z",
        "2026-08-05T20:00:00Z"
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome, {
        env: { CLAUDE_CODE_SESSION_ID: CLAUDE_SESSION },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).not.toMatch(/not yet judged/u);
      expect(allClaimLines(result.stdout)).toHaveLength(4);
      expect(result.stdout).not.toContain("export");
      expect(result.stdout).not.toContain("identifier joinable");
      // A healthy, working install — everything the chain needs has already happened —
      // reports no failing claim at all.
      expect(result.stdout).not.toContain("FAIL");
    } finally {
      await cleanup();
    }
  });

  it("names an untrusted Codex hook, not a hook that never fired", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-codex-untrusted");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeCodexHookTrust(fakeHome, "session_start");
      // Approved, but never actually trusted: parseHookTrust only reads `trusted: true`
      // from a `trusted_hash =` line directly beneath the header — none is written here.
      await writeFile(
        join(fakeHome, ".codex", "config.toml"),
        `[hooks.state."aidd-telemetry@ai-driven-dev/framework:hooks/hooks.json:session_start:0:0"]\n`
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome, {
        env: { CODEX_THREAD_ID: "codex-1" },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(
        /hook fired\s+FAIL\s+Codex has not trusted this plugin's hook/u
      );
      expect(result.stdout).not.toMatch(/never been observed firing/u);
    } finally {
      await cleanup();
    }
  });

  it("reports a hook approved under an old event name as untrusted — approval is per entry", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-codex-renamed-event");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeCodexHookTrust(fakeHome, "session-start-legacy");

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome, {
        env: { CODEX_THREAD_ID: "codex-1" },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(
        /hook fired\s+FAIL\s+Codex has not trusted this plugin's hook/u
      );
    } finally {
      await cleanup();
    }
  });

  it("falls back to never-fired, never a guess at trust, when Codex's config.toml is absent entirely", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-codex-no-config");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome, {
        env: { CODEX_THREAD_ID: "codex-1" },
      });

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+no run file/u);
      expect(result.stdout).toMatch(/never been observed firing/u);
      expect(result.stdout).toMatch(/could not be read either/u);
      expect(result.stdout).not.toMatch(/has not trusted/u);
    } finally {
      await cleanup();
    }
  });
  /**
   * The one fact this command shares with the hook, proven by making the hook state it.
   *
   * `unrecognised_payload` is written in `hooks/lib/record.cjs` (plain CommonJS, no CLI) and
   * read in `telemetry-evidence-adapter.ts` (TypeScript, a different package). Every other
   * case in this file writes the marker by hand, which checks the reader against a literal
   * the same file typed — it passes whatever the hook actually writes. Measured: renaming the
   * hook's own literal left this suite 11/11 green and the plugin's 186/186 green, because
   * the plugin side asserts only that the marker file exists, never its `type`.
   *
   * The cost of that blind spot is not a failed run, it is a wrong answer: with the marker
   * unread, a payload that did arrive reports as "the hook has never been observed firing" —
   * an unknown printed as a nothing, which is the one thing this layer promises never to do.
   * So this case seeds nothing. It runs the hook the plugin ships, on a payload matching no
   * declared host, and lets the file the hook writes be the fixture.
   */
  it("names an unrecognised payload the real hook wrote, not one this test typed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-unrecognised-real");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      // Neither a transcript path nor a timestamp: the shape no declared host matches, and
      // the same one `aidd-telemetry-journal.test.js` uses to drive this branch.
      execFileSync(process.execPath, [JOURNAL_HOOK, "session-start"], {
        input: JSON.stringify({ session_id: "not-a-known-host", cwd: projectDir }),
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/matched no known host/u);
      expect(result.stdout).not.toMatch(/never been observed firing/u);
    } finally {
      await cleanup();
    }
  });
});
