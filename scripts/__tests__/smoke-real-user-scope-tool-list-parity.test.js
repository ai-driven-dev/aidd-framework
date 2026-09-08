const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * `setup --scope user` refuses an AI tool that declares no machine-wide activation at
 * all: `registry.ts`'s `supportsUserScopeActivation` asks each profile's plugins
 * capability for a `nativeActivation` or an `installScope: "user"`, and `SetupFlow`
 * throws `UserScopeUnsupportedAiToolsError` before writing anything when one is
 * missing. `smoke-real.sh` cannot call into the built CLI to ask that question — there
 * is no command that prints it — so its `user_ai_list` names the answer as a bash
 * literal instead. That is a second home of the same fact, and the failure mode is
 * quiet in exactly the wrong direction: a sixth tool gaining machine-wide activation
 * leaves the script measuring one tool fewer than the CLI supports, and a tool losing
 * it turns every `--scope user` phase into an exit-1 nobody expected. This reads the
 * profiles and pins the two together, the same way
 * `smoke-real-plugin-cache-path-parity.test.js` pins the cache paths.
 */

function aiToolIds() {
  const text = fs.readFileSync(path.join(ROOT, "cli/src/kernel/tool.ts"), "utf8");
  const match = text.match(/export const AI_TOOL_IDS:[^=]*=\s*\[([^\]]*)\]/u);
  assert.ok(match, "kernel/tool.ts no longer declares AI_TOOL_IDS the way this guard expects");
  return match[1]
    .split(",")
    .map((id) => id.trim().replace(/^"|"$/gu, ""))
    .filter(Boolean);
}

function declaresUserScopeActivation(toolId) {
  const profile = path.join(ROOT, "cli/src/contexts/tools/domain/profiles", toolId, "profile.ts");
  const text = fs.readFileSync(profile, "utf8");
  return /nativeActivation:\s*\{/u.test(text) || /installScope:\s*"user"/u.test(text);
}

function scriptUserAiList() {
  const text = fs.readFileSync(path.join(ROOT, "cli/scripts/smoke-real.sh"), "utf8");
  const match = text.match(/user_ai_list\(\)\s*\{[\s\S]*?for t in ([^;]+);/u);
  assert.ok(match, "smoke-real.sh no longer declares user_ai_list the way this guard expects");
  return match[1].trim().split(/\s+/u);
}

describe("smoke-real.sh drives --scope user with the tools the profiles support", () => {
  it("names every AI tool whose profile declares machine-wide activation, and no other", () => {
    const supported = aiToolIds().filter(declaresUserScopeActivation);
    assert.deepEqual([...supported].sort(), ["claude", "codex", "copilot", "cursor"]);
    assert.deepEqual([...scriptUserAiList()].sort(), [...supported].sort());
  });

  it("leaves out the AI tool that declares neither, which setup --scope user refuses", () => {
    const unsupported = aiToolIds().filter((id) => !declaresUserScopeActivation(id));
    assert.deepEqual(unsupported, ["opencode"]);
    assert.ok(
      !scriptUserAiList().includes("opencode"),
      "smoke-real.sh's user_ai_list names opencode, which setup --scope user refuses outright"
    );
  });
});
