/**
 * The generated bridge's own event mapping (opencode-and-scope.md, Lot B), asserted without
 * spawning a single process — the same seam `AiddTelemetry.journalCallFor`/`journalCallsFor`
 * already give `plugins/aidd-telemetry/hooks/opencode-plugin.js`, itself tested the same way
 * in `scripts/__tests__/aidd-telemetry-opencode-payloads.test.js`.
 *
 * Why this is not a unit test: the mapping only exists as text a real plugin factory
 * function must expose as a property (F6 — OpenCode's loader calls every function-valued
 * export, so the seam cannot be a second export). Proving that property really reaches a
 * real ESM module means generating the text, writing it, and importing it — file I/O, hence
 * `integration`, not `unit`. Reimplementing the same algorithm a second time in TypeScript
 * just to call it without I/O would be the exact duplication `opencode-hooks-bridge.ts`'s own
 * module comment rules out ("one fact, one home").
 */
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { generateOpencodeHooksBridge } from "../../../../../../src/contexts/tools/domain/profiles/opencode/opencode-hooks-bridge.js";

const FIXTURES_DIR = fileURLToPath(
  new URL("../../../../../../../scripts/__tests__/fixtures/", import.meta.url)
);

async function loadFixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(join(FIXTURES_DIR, name), "utf8"));
}

// Built rather than written as a literal "${CLAUDE_PLUGIN_ROOT}" string — biome reads a
// plain string holding "${...}" as a forgotten template literal (see
// flat-build-strategy.hooks.integration.test.ts's own CLAUDE_ROOT_VAR).
const ROOT = "$" + "{CLAUDE_PLUGIN_ROOT}";

const HOOKS_JSON = JSON.stringify({
  hooks: {
    Stop: [{ hooks: [{ type: "command", command: `node ${ROOT}/hooks/turn.js` }] }],
    PostToolUse: [
      { matcher: "bash", hooks: [{ type: "command", command: `node ${ROOT}/hooks/on-tool.js` }] },
    ],
  },
});

const tempDirs: string[] = [];
afterEach(async () => {
  for (const dir of tempDirs.splice(0)) execFileSync("rm", ["-rf", dir]);
});

async function importGeneratedModule(): Promise<{
  stopCallsFor: (event: unknown, directory: string) => unknown[];
  postToolUseCallsFor: (event: unknown, directory: string) => unknown[];
}> {
  const generated = generateOpencodeHooksBridge(HOOKS_JSON, "aidd-sample");
  if (generated === null) throw new Error("expected a generated module");
  const dir = await mkdtemp(join(tmpdir(), "aidd-opencode-bridge-mapping-"));
  tempDirs.push(dir);
  const modulePath = join(dir, "bridge.mjs");
  await writeFile(modulePath, generated, "utf8");
  const mod: Record<string, unknown> = await import(pathToFileURL(modulePath).href);
  const factory = mod.AiddSampleHooks;
  if (!isBridgeFactory(factory)) {
    throw new Error(
      "the generated bridge exports no AiddSampleHooks factory carrying the mapping seams"
    );
  }
  return factory;
}

interface BridgeFactory {
  stopCallsFor: (event: unknown, directory: string) => unknown[];
  postToolUseCallsFor: (event: unknown, directory: string) => unknown[];
}

/** The factory is a function carrying its two pure mapping seams as properties. */
function isBridgeFactory(value: unknown): value is BridgeFactory {
  if (typeof value !== "function") return false;
  const stop = Reflect.get(value, "stopCallsFor");
  const post = Reflect.get(value, "postToolUseCallsFor");
  return typeof stop === "function" && typeof post === "function";
}

describe("the generated bridge's own mapping, called directly (no spawn)", () => {
  it("session.idle produces the Stop hook's call, session id and cwd carried through", async () => {
    const { stopCallsFor } = await importGeneratedModule();
    const idle = await loadFixture("opencode-session-idle.json");

    const calls = stopCallsFor(idle, "/home/user/project");

    expect(calls).toEqual([
      {
        script: "turn.js",
        args: [],
        payload: {
          hook_event_name: "Stop",
          session_id: "ses_aaaaaaaaaaaaaaaaaaaaaaaaaa",
          cwd: "/home/user/project",
        },
      },
    ]);
  });

  it("an event other than session.idle produces no Stop call", async () => {
    const { stopCallsFor } = await importGeneratedModule();

    expect(stopCallsFor({ type: "session.created" }, "/home/user/project")).toEqual([]);
  });

  it("a completed tool part matching the matcher produces the PostToolUse hook's call", async () => {
    const { postToolUseCallsFor } = await importGeneratedModule();
    const part = await loadFixture("opencode-tool-part-completed.json");

    // The captured fixture's own tool is "read"; retarget it at this test's matcher ("bash")
    // without inventing a second capture — the shape (part.tool, part.state.input,
    // part.state.status) is what scripts/__tests__/fixtures/README.md's "OpenCode's tool
    // part" section verifies, not the specific tool name.
    const retargeted = JSON.parse(JSON.stringify(part).replace('"tool":"read"', '"tool":"bash"'));

    const calls = postToolUseCallsFor(retargeted, "/home/user/project");

    expect(calls).toEqual([
      {
        script: "on-tool.js",
        args: [],
        payload: {
          hook_event_name: "PostToolUse",
          session_id: "ses_aaaaaaaaaaaaaaaaaaaaaaaaaa",
          cwd: "/home/user/project",
          tool_name: "bash",
          tool_input: (retargeted as { properties: { part: { state: { input: unknown } } } })
            .properties.part.state.input,
        },
      },
    ]);
  });

  it("a completed tool part whose tool the matcher excludes produces no call", async () => {
    const { postToolUseCallsFor } = await importGeneratedModule();
    const part = await loadFixture("opencode-tool-part-completed.json"); // tool: "read"

    expect(postToolUseCallsFor(part, "/home/user/project")).toEqual([]);
  });
});
