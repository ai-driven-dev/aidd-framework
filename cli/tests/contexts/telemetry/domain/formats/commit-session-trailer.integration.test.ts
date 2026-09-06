import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SESSION_TRAILER_TOKEN,
  sessionTrailerDelegateScript,
} from "../../../../../src/contexts/telemetry/domain/formats/commit-session-trailer.js";

/**
 * The delegate as git actually invokes it: `sh <script> <message-file> <message-source>`.
 * The unit test asserts on the script's own text, which cannot catch a `case` branch
 * matching the wrong argument or skipping the wrong source - only running the generated
 * script for real proves what it does with each `message_source` git passes.
 */
const SESSION = "55555555-5555-4555-8555-555555555555";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
  created.length = 0;
});

/** Every variable the delegate reads, stripped before a session is added back - this suite
 * runs inside a real Claude Code session, so a bare `process.env` already carries one. */
function withoutSessionVariables(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const { CODEX_THREAD_ID, CLAUDE_CODE_SESSION_ID, ...rest } = env;
  return rest;
}

async function runDelegate(
  message: string,
  messageSource: string,
  sessionEnv: NodeJS.ProcessEnv = {}
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "aidd-trailer-delegate-"));
  created.push(dir);
  const scriptPath = join(dir, "aidd-session-trailer.sh");
  const messagePath = join(dir, "MSG");
  await writeFile(scriptPath, sessionTrailerDelegateScript());
  await writeFile(messagePath, message);

  execFileSync("sh", [scriptPath, messagePath, messageSource], {
    env: { ...withoutSessionVariables(process.env), ...sessionEnv },
  });

  return readFile(messagePath, "utf8");
}

describe("the delegate's own case statement, run against each source git passes", () => {
  it("trailers a merge a session resolved - that is session work, not a person authoring it", async () => {
    const written = await runDelegate("merged", "merge", { CLAUDE_CODE_SESSION_ID: SESSION });

    expect(written).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
  });

  it("trailers a squash a session produced, the same way", async () => {
    const written = await runDelegate("squashed", "squash", { CLAUDE_CODE_SESSION_ID: SESSION });

    expect(written).toContain(`${SESSION_TRAILER_TOKEN}: ${SESSION}`);
  });

  it("still writes nothing when no session made the commit", async () => {
    const written = await runDelegate("by-hand", "message", {});

    expect(written).not.toContain(SESSION_TRAILER_TOKEN);
  });

  it("never doubles a trailer a prior run already wrote", async () => {
    const once = await runDelegate("merged", "merge", { CLAUDE_CODE_SESSION_ID: SESSION });

    const twice = await runDelegate(once, "merge", { CLAUDE_CODE_SESSION_ID: SESSION });

    expect(twice.split(SESSION_TRAILER_TOKEN).length - 1).toBe(1);
  });
});
