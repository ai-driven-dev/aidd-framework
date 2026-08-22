import { type ChildProcessWithoutNullStreams, execFile, spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { environmentWithoutGitVariables as withoutGitEnv } from "../../src/infrastructure/git-environment.js";
import { CLI_PATH, createTestEnv, gitInit, gitSetOriginRemote, runCli } from "./helpers.js";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(process.cwd(), "..");
const PLUGIN_SOURCE = join(REPO_ROOT, "plugins", "aidd-telemetry");
const JOURNAL_HOOK_RELATIVE = join(".claude", "plugins", "aidd-telemetry", "hooks", "journal.js");
const SESSION_START_FIXTURE = join(
  REPO_ROOT,
  "scripts",
  "__tests__",
  "fixtures",
  "claude-code-session-start.json"
);
const LOGS_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "telemetry-sink",
  "otlp-logs-claude-code.json"
);
const METRICS_FIXTURE = join(
  process.cwd(),
  "tests",
  "fixtures",
  "telemetry-sink",
  "otlp-metrics-claude-code.json"
);

// The redacted values a real capture carried and the sink must never reproduce — an
// export-provenance record carries no identity attribute at all. Kept in step with
// tests/fixtures/telemetry-sink/*.
const NEVER_STORED_VALUES = [
  "person@example.com",
  "user_00EXAMPLEACCOUNTID0000000",
  "00000000-1111-4222-8333-444444444444",
  "00000000-2222-4333-8444-555555555555",
  "Orca",
  "0000000000000000000000000000000000000000000000000000000000000000", // user.id
];

interface RunningReceiver {
  readonly sinkDir: string;
  readonly baseUrl: string;
  stop(): Promise<void>;
}

/** Spawns the built binary's `telemetry receive`, parsing the two lines it is required to
 * print before it starts listening — the sink path, then the bound port. */
async function startReceiver(env: NodeJS.ProcessEnv): Promise<RunningReceiver> {
  const child: ChildProcessWithoutNullStreams = spawn(
    process.execPath,
    [CLI_PATH, "telemetry", "receive", "--port", "0"],
    { env: withoutGitEnv(env) }
  );

  let stdout = "";
  const ready = new Promise<{ sinkDir: string; port: number }>((res, reject) => {
    const timeout = setTimeout(() => reject(new Error(`receiver did not start: ${stdout}`)), 10000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      const sinkMatch = stdout.match(/AIDD telemetry sink -> (.+)/);
      const portMatch = stdout.match(/http:\/\/localhost:(\d+)/);
      if (sinkMatch && portMatch) {
        clearTimeout(timeout);
        res({ sinkDir: (sinkMatch[1] ?? "").trim(), port: Number(portMatch[1]) });
      }
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`receiver exited early with code ${code}: ${stdout}`));
    });
  });

  const { sinkDir, port } = await ready;
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  return {
    sinkDir,
    baseUrl: `http://localhost:${port}`,
    // Idempotent: a test may stop the receiver itself to prove the file survives its
    // exit, and afterEach's safety-net cleanup must not hang waiting for a second exit
    // event a process that already died will never emit.
    stop: () =>
      new Promise<void>((res) => {
        if (exited) {
          res();
          return;
        }
        child.once("exit", () => res());
        child.kill();
      }),
  };
}

async function postFixture(baseUrl: string, path: string, fixturePath: string): Promise<number> {
  const body = readFileSync(fixturePath, "utf8");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  return response.status;
}

async function readSinkLines(sinkDir: string): Promise<Record<string, unknown>[]> {
  const entries = await readdir(sinkDir).catch(() => []);
  const lines: Record<string, unknown>[] = [];
  for (const entry of entries.filter((e) => e.endsWith(".jsonl"))) {
    const content = await readFile(join(sinkDir, entry), "utf8");
    for (const line of content.trim().split("\n").filter(Boolean)) {
      lines.push(JSON.parse(line));
    }
  }
  return lines;
}

const activeReceivers: RunningReceiver[] = [];
afterEach(async () => {
  await Promise.all(activeReceivers.splice(0).map((r) => r.stop()));
});

describe("E2E: telemetry sink", () => {
  it("stores a real session's figures, survives the receiver's exit, and carries no identity of any kind", async () => {
    const { fakeHome, cleanup } = await createTestEnv("telemetry-sink-journey");
    try {
      const env = { ...process.env, HOME: fakeHome, XDG_CONFIG_HOME: join(fakeHome, ".config") };
      const receiver = await startReceiver(env);
      activeReceivers.push(receiver);

      expect(await postFixture(receiver.baseUrl, "/v1/logs", LOGS_FIXTURE)).toBe(200);
      expect(await postFixture(receiver.baseUrl, "/v1/metrics", METRICS_FIXTURE)).toBe(200);

      await receiver.stop();

      // A separate process reads what the (now exited) receiver wrote.
      const lines = await readSinkLines(receiver.sinkDir);
      expect(lines.length).toBeGreaterThan(0);

      const requestLine = lines.find((l) => l.kind === "request");
      expect(requestLine?.cost_usd).toBeGreaterThan(0);
      expect(requestLine?.model).toBe("claude-sonnet-5");
      expect(requestLine?.input_tokens).toBeGreaterThanOrEqual(0);

      const activeTimeLine = lines.find((l) => l.active_time_s !== undefined);
      expect(activeTimeLine?.active_time_s).toBe(9.714);

      const serialized = JSON.stringify(lines);
      for (const forbidden of NEVER_STORED_VALUES) {
        expect(serialized).not.toContain(forbidden);
      }
      expect(
        lines.every((l) => Object.keys(l).every((k) => k !== "user_email" && k !== "user_id"))
      ).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("answers a malformed body, writes nothing for it, and stays up for the next payload", async () => {
    const { fakeHome, cleanup } = await createTestEnv("telemetry-sink-malformed");
    try {
      const env = { ...process.env, HOME: fakeHome, XDG_CONFIG_HOME: join(fakeHome, ".config") };
      const receiver = await startReceiver(env);
      activeReceivers.push(receiver);

      const malformedResponse = await fetch(`${receiver.baseUrl}/v1/logs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json{{{",
      });
      expect(malformedResponse.status).toBe(200);

      const linesAfterMalformed = await readSinkLines(receiver.sinkDir);
      expect(linesAfterMalformed).toHaveLength(0);

      // Still up: the same receiver accepts the next, well-formed payload.
      expect(await postFixture(receiver.baseUrl, "/v1/logs", LOGS_FIXTURE)).toBe(200);
      await receiver.stop();

      const linesAfterGood = await readSinkLines(receiver.sinkDir);
      expect(linesAfterGood.length).toBeGreaterThan(0);
    } finally {
      await cleanup();
    }
  });

  it("honours AIDD_USER_CONFIG_DIR — writing somewhere else entirely", async () => {
    const { fakeHome, tempDir, cleanup } = await createTestEnv("telemetry-sink-config-dir");
    try {
      const overrideDir = join(tempDir, "elsewhere", "aidd-config");
      const env = {
        ...process.env,
        HOME: fakeHome,
        XDG_CONFIG_HOME: join(fakeHome, ".config"),
        AIDD_USER_CONFIG_DIR: overrideDir,
      };
      const receiver = await startReceiver(env);
      activeReceivers.push(receiver);

      expect(receiver.sinkDir).toBe(join(overrideDir, "telemetry"));
      expect(await postFixture(receiver.baseUrl, "/v1/logs", LOGS_FIXTURE)).toBe(200);
      await receiver.stop();

      const lines = await readSinkLines(receiver.sinkDir);
      expect(lines.length).toBeGreaterThan(0);

      const defaultDirLines = await readSinkLines(join(fakeHome, ".config", "aidd", "telemetry"));
      expect(defaultDirLines).toHaveLength(0);
    } finally {
      await cleanup();
    }
  });

  it("tells a billed-nothing (but journaled) session apart from a session never journaled at all", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-sink-two-absences");
    const priorGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = "/should/never/be/read";
    try {
      await gitInit(projectDir);
      await gitSetOriginRemote(projectDir, "git@github.com:acme-test/two-absences.git");
      expect((await runCli(["ai", "install", "claude"], projectDir, fakeHome)).exitCode).toBe(0);
      expect(
        (await runCli(["plugin", "install", PLUGIN_SOURCE, "--yes"], projectDir, fakeHome)).exitCode
      ).toBe(0);
      await mkdir(join(projectDir, ".aidd"), { recursive: true });
      await writeFile(
        join(projectDir, ".aidd", "config.json"),
        JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } })
      );

      const billedNothingSessionId = "aaaa1111-0000-4000-8000-000000000001";
      const payload = JSON.parse(readFileSync(SESSION_START_FIXTURE, "utf-8"));
      payload.cwd = projectDir;
      payload.session_id = billedNothingSessionId;

      const hookPath = join(projectDir, JOURNAL_HOOK_RELATIVE);
      const hook = execFileAsync(process.execPath, [hookPath, "session-start"], {
        env: withoutGitEnv(process.env),
      });
      hook.child.stdin?.end(JSON.stringify(payload));
      const { stderr } = await hook;
      expect(stderr).toBe("");

      // Journaled: the run journal recorded it even though it billed nothing to the sink.
      const runFiles = readdirSync(join(projectDir, "aidd_docs", "runs"));
      expect(runFiles).toHaveLength(1);
      const runLines = readFileSync(
        join(projectDir, "aidd_docs", "runs", runFiles[0] as string),
        "utf-8"
      )
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l));
      expect(runLines[0].type).toBe("session_start");
      expect(runLines[0].vendor_id).toBe(billedNothingSessionId);

      // Never journaled: no run file exists for this id at all.
      const neverJournaledSessionId = "bbbb2222-0000-4000-8000-000000000002";
      const allRunContent = runLines.map((l: unknown) => JSON.stringify(l)).join("\n");
      expect(allRunContent).not.toContain(neverJournaledSessionId);

      // The sink alone cannot tell the two apart — neither was ever posted to it.
      const sinkDir = join(fakeHome, ".config", "aidd", "telemetry");
      const sinkLines = await readSinkLines(sinkDir);
      const sinkSerialized = JSON.stringify(sinkLines);
      expect(sinkSerialized).not.toContain(billedNothingSessionId);
      expect(sinkSerialized).not.toContain(neverJournaledSessionId);
    } finally {
      if (priorGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = priorGitDir;
      await cleanup();
    }
  });

  it("with no receiver listening, enabling telemetry and running a session both succeed", async () => {
    const { projectDir, fakeHome, cleanup } = await createTestEnv("telemetry-sink-no-receiver");
    try {
      await gitInit(projectDir);
      await gitSetOriginRemote(projectDir, "git@github.com:acme-test/no-receiver.git");
      expect((await runCli(["ai", "install", "claude"], projectDir, fakeHome)).exitCode).toBe(0);
      expect(
        (await runCli(["plugin", "install", PLUGIN_SOURCE, "--yes"], projectDir, fakeHome)).exitCode
      ).toBe(0);

      // Port 4318 is the default nothing is bound to in this sandboxed test run.
      const on = await runCli(
        ["telemetry", "on", "--endpoint", "http://127.0.0.1:4318"],
        projectDir,
        fakeHome
      );
      expect(on.exitCode).toBe(0);

      await mkdir(join(projectDir, ".aidd"), { recursive: true });
      await writeFile(
        join(projectDir, ".aidd", "config.json"),
        JSON.stringify({ telemetry: { enabled: true, endpoint: "http://127.0.0.1:4318" } })
      );
      const payload = JSON.parse(readFileSync(SESSION_START_FIXTURE, "utf-8"));
      payload.cwd = projectDir;
      payload.session_id = "cccc3333-0000-4000-8000-000000000003";

      const hookPath = join(projectDir, JOURNAL_HOOK_RELATIVE);
      const hook = execFileAsync(process.execPath, [hookPath, "session-start"], {
        env: withoutGitEnv(process.env),
      });
      hook.child.stdin?.end(JSON.stringify(payload));
      const { stderr } = await hook;
      expect(stderr).toBe("");
    } finally {
      await cleanup();
    }
  });
});
