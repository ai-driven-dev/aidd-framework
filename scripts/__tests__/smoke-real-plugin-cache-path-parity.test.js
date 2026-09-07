const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.resolve(__dirname, "../..");

/**
 * `smoke-real.sh` cannot call into the built CLI to read `NativeActivation.pluginCacheDir`
 * back out — there is no command that prints it — so it names `~/.claude/plugins/cache`
 * and `~/.codex/plugins/cache` as bash literals instead. That is a second home of the
 * same fact `claude/profile.ts` and `codex/profile.ts` each declare, and nothing pinned
 * the two together before this: the profile's own path could drift and every "the cache
 * is gone" assertion in the script would silently stop meaning anything, watching the
 * wrong directory. This reads both source files and compares the literal path segments.
 */

function pluginCacheDirSegments(profileFile) {
  const text = fs.readFileSync(path.join(ROOT, "cli/src/contexts/tools/domain/profiles", profileFile), "utf8");
  const match = text.match(/pluginCacheDir:\s*\(h\)\s*=>\s*join\(h,\s*([^)]+)\)/u);
  assert.ok(
    match,
    `${profileFile} no longer declares pluginCacheDir the way this guard expects`
  );
  return match[1]
    .split(",")
    .map((segment) => segment.trim().replace(/^"|"$/gu, ""))
    .join("/");
}

function smokeRealScript() {
  return fs.readFileSync(path.join(ROOT, "cli/scripts/smoke-real.sh"), "utf8");
}

describe("smoke-real.sh names the same cache path each profile declares", () => {
  it("claude's literal path matches claude/profile.ts's own pluginCacheDir", () => {
    const expected = pluginCacheDirSegments("claude/profile.ts");
    assert.equal(expected, ".claude/plugins/cache");
    assert.ok(
      smokeRealScript().includes(expected),
      `smoke-real.sh does not contain the literal path segment '${expected}' claude/profile.ts declares`
    );
  });

  it("codex's literal path matches codex/profile.ts's own pluginCacheDir", () => {
    const expected = pluginCacheDirSegments("codex/profile.ts");
    assert.equal(expected, ".codex/plugins/cache");
    assert.ok(
      smokeRealScript().includes(expected),
      `smoke-real.sh does not contain the literal path segment '${expected}' codex/profile.ts declares`
    );
  });
});
