/**
 * An empty catch turns an unreadable file into an absent one. The handful that remain are
 * best-effort cleanups, each named here with its reason, and the list only shrinks.
 */
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, read, sourceFiles } from "./helpers.js";

/** File → how many empty catches it keeps, and why each is a deliberate best effort. */
const BASELINE: Readonly<Record<string, { readonly count: number; readonly reason: string }>> = {
  "src/contexts/framework/infrastructure/manifest-repository-adapter.ts": {
    count: 2,
    reason: "deleting a manifest, then its empty directory, must not fail an uninstall midway",
  },
  "src/contexts/telemetry/infrastructure/telemetry-sink-adapter.ts": {
    count: 2,
    reason: "icacls and chmod are best effort on someone else's directory or a modeless filesystem",
  },
  "src/contexts/tools/domain/profiles/opencode/opencode-hooks-bridge.ts": {
    count: 2,
    reason:
      "the bridge text shipped into OpenCode: a hook that fails must never surface as a thrown error inside the host",
  },
  "tests/contexts/tools/domain/profiles/opencode/opencode-hooks-bridge.unit.test.ts": {
    count: 2,
    reason: "asserts that same bridge text byte for byte",
  },
  "src/runtime/filesystem/file-adapter.ts": {
    count: 1,
    reason: "a refusal to delete something present must not fail an uninstall midway",
  },
  "tests/e2e/framework-build.e2e.test.ts": {
    count: 1,
    reason: "hashing a tree skips directories and vanished entries",
  },
  "tests/golden/framework-build-golden.e2e.test.ts": {
    count: 1,
    reason: "hashing a tree skips directories and vanished entries",
  },
  "tests/helpers/ports/in-memory-file-adapter.ts": {
    count: 1,
    reason: "a merge over invalid JSON overwrites, as the real adapter does",
  },
  "tests/helpers/ports/seed-from-directory.ts": {
    count: 1,
    reason: "seeding a fixture skips an unreadable entry",
  },
};

/** The probes below plant the very shape this guard reports. */
const SELF = "tests/architecture/catches-that-swallow.arch.test.ts";

const CATCH_HEAD = /\bcatch\s*(?:\([^)]*\))?\s*\{/g;

/** Lines whose catch block holds nothing but whitespace and comments. */
function swallowedCatches(text: string): number[] {
  const lines: number[] = [];
  for (const match of text.matchAll(CATCH_HEAD)) {
    const bodyStart = match.index + match[0].length;
    const body = text.slice(bodyStart);
    const closing = body.indexOf("}");
    if (closing === -1) continue;
    const inside = body
      .slice(0, closing)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "")
      .trim();
    if (inside === "") lines.push(text.slice(0, match.index).split("\n").length);
  }
  return lines;
}

function testFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry !== "fixtures" && entry !== "snapshots") walk(full);
      } else if (entry.endsWith(".ts")) out.push(relative(CLI_ROOT, full));
    }
  };
  walk(join(CLI_ROOT, "tests"));
  return out.sort();
}

describe("a catch never swallows", () => {
  it("every empty catch under src/ and tests/ is a listed best effort, and none is listed twice over", () => {
    const found = new Map<string, number>();
    for (const file of [...sourceFiles(), ...testFiles()]) {
      if (file === SELF) continue;
      const lines = swallowedCatches(read(file));
      if (lines.length > 0) found.set(file, lines.length);
    }

    const added = [...found]
      .filter(([file, count]) => count > (BASELINE[file]?.count ?? 0))
      .map(
        ([file, count]) =>
          `${file}: ${count} empty catch(es), ${BASELINE[file]?.count ?? 0} allowed`
      );
    const fixed = Object.entries(BASELINE)
      .filter(([file, { count }]) => (found.get(file) ?? 0) < count)
      .map(([file]) => file);

    expect(added, "convert the error into a typed one or let it travel").toEqual([]);
    expect(fixed, "fixed — lower or remove these in BASELINE").toEqual([]);
  });

  it("every baseline entry says why", () => {
    for (const [file, { reason }] of Object.entries(BASELINE)) {
      expect(reason.length, `${file} is allowed with no reason given`).toBeGreaterThan(30);
    }
  });
});

describe("the guard itself", () => {
  it("reports a catch holding only whitespace or a comment, and clears one that does something", () => {
    const planted = [
      "try { a(); } catch {}",
      "try { b(); } catch (error) {\n  // a reason\n}",
      "try { c(); } catch (e) { /* later */ }",
      "try { d(); } catch (error) { throw new TypedError(error); }",
      "try { e(); } catch { return null; }",
    ].join("\n");
    expect(swallowedCatches(planted)).toEqual([1, 2, 5]);
  });

  it("reads a bare block as nothing to report", () => {
    expect(swallowedCatches("const x = {};\nfunction catchAll() {}")).toEqual([]);
  });
});
