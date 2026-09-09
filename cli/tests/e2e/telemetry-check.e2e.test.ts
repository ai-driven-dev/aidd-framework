import { execFileSync } from "node:child_process";
import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { environmentWithoutGitVariables } from "../../src/runtime/git/git-environment.js";
import { createTestEnv, gitInit, identityFileIn, runCli, sinkDirIn } from "./helpers.js";

const LOCAL_COST_FIXTURES = join(process.cwd(), "tests", "fixtures", "local-cost");
const REPO_ROOT = resolve(process.cwd(), "..");
const JOURNAL_HOOK = join(REPO_ROOT, "plugins", "aidd-telemetry", "hooks", "journal.cjs");
// Built from two literals, so this definition itself holds no literal `${...}`: biome's
// noTemplateCurlyInString flags a bare `${CLAUDE_PLUGIN_ROOT}` inside a plain string.
const CLAUDE_PLUGIN_ROOT_TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";

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

/** `~/.codex/config.toml`'s own trust table shape. The event name is a parameter because
 * the renamed-event case approves a hook under one name and checks under another. */
async function writeCodexHookTrust(fakeHome: string, eventName: string): Promise<void> {
  await mkdir(join(fakeHome, ".codex"), { recursive: true });
  await writeFile(
    join(fakeHome, ".codex", "config.toml"),
    `[hooks.state."aidd-telemetry@ai-driven-dev/framework:hooks/hooks.json:${eventName}:0:0"]
trusted_hash = "deadbeef"
`
  );
}

// Matched by label, not by position: a "what is in place" section prints ahead of the
// four claims, so slicing the first four lines of stdout does not land on them.
const CLAIM_LINE = /^ {2}(hook fired|session journalled|tool files readable|records join)\b/u;

/** Every claim line the union covers, in the fixed order `diagnoseTelemetryClaims` prints
 * in - never the "not covered" lines after them, whose count depends on the machine. */
function allClaimLines(stdout: string): string[] {
  return stdout.split("\n").filter((line) => CLAIM_LINE.test(line));
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

  it("exits 1 when a claim fails, not 0 with the failure only printed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-exit-code-fail");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.stdout).toContain("FAIL");
      expect(result.exitCode).toBe(1);
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

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+no run file/u);
      expect(result.stdout).toMatch(/never been observed firing/u);
      // "Nothing has run yet" is not "everything is broken": with no journal at all, the
      // three claims that read from it have no material to judge, and say so.
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

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/matched no known host/u);
      expect(result.stdout).toContain("2026-08-22T09:00:00Z");
    } finally {
      await cleanup();
    }
  });

  it("names an anchorless run file as its own failure, not an unrecognised payload, for a run file torn before session_start ever parsed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-torn");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await seedTornRunFile(projectDir);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(1);
      // A run file demonstrably exists here (torn though it is) — this is never read as
      // "no run file": that would say a file this build can see does not exist.
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+1 run file\(s\)/u);
      expect(result.stdout).toMatch(/none carry a readable session_start/u);
      expect(result.stdout).not.toMatch(/matched no known host/u);
      expect(result.stdout).not.toMatch(/no run file in/u);
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

      expect(result.exitCode, result.stderr).toBe(1);
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

      expect(result.exitCode, result.stderr).toBe(1);
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

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+no run file/u);
      expect(result.stdout).toMatch(/never been observed firing/u);
      expect(result.stdout).toMatch(/could not be read either/u);
      expect(result.stdout).not.toMatch(/has not trusted/u);
    } finally {
      await cleanup();
    }
  });
  /** `unrecognised_payload` is written by the hook and read by `telemetry-evidence-adapter.ts`;
   * seeding the marker by hand would only check the reader against a literal this file typed. */
  it("names an unrecognised payload the real hook wrote, not one this test typed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-unrecognised-real");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      // Neither a transcript path nor a timestamp: the shape no declared host matches.
      execFileSync(process.execPath, [JOURNAL_HOOK, "session-start"], {
        input: JSON.stringify({ session_id: "not-a-known-host", cwd: projectDir }),
        cwd: projectDir,
        env: environmentWithoutGitVariables(process.env),
      });

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/matched no known host/u);
      expect(result.stdout).not.toMatch(/never been observed firing/u);
    } finally {
      await cleanup();
    }
  });
});

async function writeDamagedIdentity(fakeHome: string): Promise<void> {
  const path = identityFileIn(fakeHome);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, "not-json");
}

async function writeEnabledPlugin(projectDir: string, pluginKey: string): Promise<void> {
  await mkdir(join(projectDir, ".claude"), { recursive: true });
  await writeFile(
    join(projectDir, ".claude", "settings.json"),
    JSON.stringify({ enabledPlugins: { [pluginKey]: true } })
  );
}

// A hooks block a headless CI, or `aidd framework build --target claude --flat`'s own
// output, can declare directly — never through `enabledPlugins` at all.
async function writeClaudeHooksBlock(projectDir: string, command: string): Promise<void> {
  await mkdir(join(projectDir, ".claude"), { recursive: true });
  await writeFile(
    join(projectDir, ".claude", "settings.json"),
    JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command }] }] } })
  );
}

// Cursor's own plugin-scope hooks never fire — this project-scope flat file is the only
// place a Cursor install's hook declaration is ever real.
async function writeCursorHooksBlock(projectDir: string, command: string): Promise<void> {
  await mkdir(join(projectDir, ".cursor"), { recursive: true });
  await writeFile(
    join(projectDir, ".cursor", "hooks.json"),
    JSON.stringify({ version: 1, hooks: { sessionStart: [{ command }] } })
  );
}

/**
 * A machine that has never been measured still gets an answer, and a person switched
 * off still sees everything but the verdicts: this half states, it never grades.
 */
describe("aidd telemetry check — what is in place, before any verdict", () => {
  it("states what is in place on a machine that has never measured anything, naming the file behind each fact", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-fresh");
    try {
      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/measurement allowed\s+no —/u);
      expect(result.stdout).toContain(join(projectDir, ".aidd", "config.json"));
      expect(result.stdout).toMatch(/identity attached\s+no —/u);
      expect(result.stdout).toContain(identityFileIn(fakeHome));
      expect(result.stdout).toMatch(/records kept at\s+/u);
      expect(result.stdout).toContain(sinkDirIn(fakeHome));
      expect(result.stdout).toMatch(/recorder declared\s+nowhere this build checks/u);
      expect(result.stdout).toContain(join(projectDir, ".aidd", "manifest.json"));
      // What is in place is never itself a verdict — no count, no figure, and no FAIL.
      expect(result.stdout).not.toContain("FAIL");
      // Never reduced to the one-line gate message alone.
      expect(result.stdout.trim().split("\n").length).toBeGreaterThan(1);
    } finally {
      await cleanup();
    }
  });

  it("distinguishes this person's own refusal from a project nobody switched on", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-refusal");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      const refused = await runCli(["telemetry", "check"], projectDir, fakeHome, {
        env: { AIDD_TELEMETRY: "0" },
      });
      expect(refused.stdout).toMatch(/measurement allowed\s+no — this person's own refusal/u);
      expect(refused.stdout).toContain("AIDD_TELEMETRY");

      await writeSwitch(projectDir, false);
      const neverOn = await runCli(["telemetry", "check"], projectDir, fakeHome);
      expect(neverOn.stdout).toMatch(/measurement allowed\s+no —/u);
      expect(neverOn.stdout).not.toMatch(/own refusal/u);
    } finally {
      await cleanup();
    }
  });

  it("keeps every other stated fact when the identity file cannot be read", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-damaged-identity");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeDamagedIdentity(fakeHome);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/identity attached\s+could not be read/u);
      expect(result.stdout).toContain(identityFileIn(fakeHome));
      // Every other stated fact still appears — one damaged file costs only itself.
      expect(result.stdout).toMatch(/measurement allowed\s+yes/u);
      expect(result.stdout).toMatch(/records kept at\s+/u);
      expect(result.stdout).toMatch(/recorder declared\s+/u);
      expect(result.stdout).toContain("hook fired");
    } finally {
      await cleanup();
    }
  });

  it("names where the recorder is declared, when a tool's own settings say so", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-declared");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeEnabledPlugin(projectDir, "aidd-telemetry@ai-driven-dev/framework");

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+yes —/u);
      expect(result.stdout).toContain(join(projectDir, ".claude", "settings.json"));
    } finally {
      await cleanup();
    }
  });

  it("names where the recorder is declared, when a hooks block invokes it directly rather than through enabledPlugins", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-declared-hooks");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeClaudeHooksBlock(
        projectDir,
        `node ${CLAUDE_PLUGIN_ROOT_TOKEN}/hooks/journal.cjs session-start`
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+yes —/u);
      expect(result.stdout).toContain(join(projectDir, ".claude", "settings.json"));
    } finally {
      await cleanup();
    }
  });

  it("names Cursor's project-scope hooks file as a declaration — the only route a Cursor install's hook ever fires from", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv(
      "check-setup-declared-cursor-hooks"
    );
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeCursorHooksBlock(
        projectDir,
        "./.cursor/hooks/aidd-telemetry/journal.cjs session-start"
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+yes —/u);
      expect(result.stdout).toContain(join(projectDir, ".cursor", "hooks.json"));
    } finally {
      await cleanup();
    }
  });

  it("stops recognising a hooks block once it stops naming the recorder's own script, proving the match is not a loose substring", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-hooks-mutation");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeClaudeHooksBlock(
        projectDir,
        `node ${CLAUDE_PLUGIN_ROOT_TOKEN}/hooks/journal.cjs session-start`
      );
      const declared = await runCli(["telemetry", "check"], projectDir, fakeHome);
      expect(declared.stdout).toMatch(/recorder declared\s+yes —/u);

      await writeClaudeHooksBlock(
        projectDir,
        `node ${CLAUDE_PLUGIN_ROOT_TOKEN}/hooks/unrelated.cjs session-start`
      );
      const undeclared = await runCli(["telemetry", "check"], projectDir, fakeHome);
      expect(undeclared.stdout).toMatch(/recorder declared\s+nowhere this build checks/u);
    } finally {
      await cleanup();
    }
  });

  it("says the declaration could not be read, never that the recorder is missing, for a damaged declaring file", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv(
      "check-setup-declaration-damaged"
    );
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await mkdir(join(projectDir, ".claude"), { recursive: true });
      // Trailing comma — valid enabledPlugins content, invalid JSON.
      await writeFile(
        join(projectDir, ".claude", "settings.json"),
        '{"enabledPlugins":{"aidd-telemetry@aidd":true},}'
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+could not be read —/u);
      expect(result.stdout).toContain(join(projectDir, ".claude", "settings.json"));
      // Never graded as the recorder missing: a damaged file costs only itself.
      expect(result.stdout).not.toMatch(/recorder declared\s+nowhere this build checks/u);
      expect(result.stdout).toMatch(/hook fired\s+--\s+no run file/u);
      expect(result.stdout).not.toContain("FAIL");
    } finally {
      await cleanup();
    }
  });

  it("never reads another plugin's own journal.cjs as this recorder being declared", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-foreign-journal");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeClaudeHooksBlock(projectDir, "node /autre-plugin/hooks/journal.cjs session-start");

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/recorder declared\s+nowhere this build checks/u);
    } finally {
      await cleanup();
    }
  });

  it("still recognises the recorder's own hooks-block entry point when the command is quoted", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-quoted-hooks");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeClaudeHooksBlock(
        projectDir,
        `node "${CLAUDE_PLUGIN_ROOT_TOKEN}/hooks/journal.cjs" session-start`
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+yes —/u);
    } finally {
      await cleanup();
    }
  });

  it("names Copilot's own settings file as a declaration route, not one this build never reads", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-setup-declared-copilot");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await mkdir(join(projectDir, ".github", "copilot"), { recursive: true });
      await writeFile(
        join(projectDir, ".github", "copilot", "settings.json"),
        JSON.stringify({ enabledPlugins: { "aidd-telemetry@ai-driven-dev/framework": true } })
      );

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(result.stdout).toMatch(/recorder declared\s+yes —/u);
      expect(result.stdout).toContain(join(projectDir, ".github", "copilot", "settings.json"));
    } finally {
      await cleanup();
    }
  });
});

/**
 * The same absence — no run file — reads two different ways depending on whether the
 * recorder is declared. Proven by mutation on one project, never two fixtures.
 */
describe("aidd telemetry check — not yet stops being a failure", () => {
  it("reports nothing to evaluate, never a failure, once the recorder is declared — and a failure naming it before that", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-not-yet-mutation");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);

      const beforeDeclaring = await runCli(["telemetry", "check"], projectDir, fakeHome);
      expect(beforeDeclaring.exitCode, beforeDeclaring.stderr).toBe(1);
      expect(beforeDeclaring.stdout).toMatch(/hook fired\s+FAIL\s+no run file/u);
      expect(beforeDeclaring.stdout).toMatch(/recorder is declared nowhere/u);

      await writeEnabledPlugin(projectDir, "aidd-telemetry@ai-driven-dev/framework");

      const afterDeclaring = await runCli(["telemetry", "check"], projectDir, fakeHome);
      expect(afterDeclaring.exitCode, afterDeclaring.stderr).toBe(0);
      expect(afterDeclaring.stdout).toMatch(/hook fired\s+--\s+no run file/u);
      expect(afterDeclaring.stdout).toMatch(/nothing to evaluate/u);
      expect(afterDeclaring.stdout).toMatch(/declaration is not proof/u);
      expect(afterDeclaring.stdout).not.toContain("FAIL");
    } finally {
      await cleanup();
    }
  });

  it("keeps the verdict a run file already earned, whatever the recorder's own declaration says", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("check-not-yet-settled-stays");
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      // No settings, no manifest — the recorder is declared nowhere — yet a run file
      // already exists for this very session, so the claim it earns is "ok".
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

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/hook fired\s+ok/u);
      expect(result.stdout).not.toMatch(/recorder is declared nowhere/u);
    } finally {
      await cleanup();
    }
  });

  it("keeps the verdict an anchorless run file already earned once the recorder is declared, never nothing to evaluate", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv(
      "check-not-yet-anchorless-declared"
    );
    try {
      await gitInit(projectDir);
      await writeSwitch(projectDir, true);
      await writeEnabledPlugin(projectDir, "aidd-telemetry@ai-driven-dev/framework");
      // Reachable, not synthetic: a hooks block registering PostToolUse/Stop but never
      // SessionStart writes exactly this shape — journal lines with no session_start.
      await seedTornRunFile(projectDir);

      const result = await runCli(["telemetry", "check"], projectDir, fakeHome);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(result.stdout).toMatch(/hook fired\s+FAIL\s+1 run file\(s\)/u);
      expect(result.stdout).toMatch(/none carry a readable session_start/u);
      expect(result.stdout).not.toMatch(/nothing to evaluate/u);
      expect(result.stdout).not.toMatch(/no run file in/u);
    } finally {
      await cleanup();
    }
  });
});
