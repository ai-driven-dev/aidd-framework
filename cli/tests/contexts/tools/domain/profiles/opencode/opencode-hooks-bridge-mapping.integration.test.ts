// The mapping exists only as generated text a real ESM module must expose as a property of its
// factory, so proving it reaches one means writing and importing that file — integration, not unit.
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

// Built rather than written as a literal "${CLAUDE_PLUGIN_ROOT}" string: biome reads a plain
// string holding "${...}" as a forgotten template literal.
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

    // The captured fixture's own tool is "read"; retarget it at this test's matcher without
    // inventing a second capture — the part's shape is what is verified, not the tool name.
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
