/**
 * A file whose specifier climbs above `src/contexts/<X>/` and then spells `<X>` back out lands
 * on a module it could reach directly — the scar a mechanical file move leaves. Not a boundary
 * violation: a real cross-context edge climbs out and never comes back.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, INTERNAL_IMPORT, read, sourceFiles } from "./helpers.js";

/** `src/contexts/<X>/` is always three path segments. */
const CONTEXT_ROOT_DEPTH = 3;

/**
 * Whether a specifier climbs out of `src/contexts/<context>/` and spells `context` back out on
 * the way down. One that only climbs within the context never reaches this depth.
 */
function climbsOutAndReenters(specifier: string, context: string, fileDirDepth: number): boolean {
  if (!specifier.startsWith("..")) return false;
  const segments = specifier.split("/");
  let up = 0;
  for (const segment of segments) {
    if (segment === "..") up += 1;
    else break;
  }
  const upsNeededToExit = fileDirDepth - CONTEXT_ROOT_DEPTH + 1;
  if (up < upsNeededToExit) return false;
  const remaining = segments.slice(up);
  return remaining[0] === context || (remaining[0] === "contexts" && remaining[1] === context);
}

function selfReentryViolations(files: readonly string[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const match = /^src\/contexts\/([^/]+)\//.exec(file);
    if (!match) continue;
    const context = match[1] as string;
    const fileDirDepth = file.slice(0, file.lastIndexOf("/")).split("/").length;
    for (const importMatch of read(file).matchAll(INTERNAL_IMPORT)) {
      const specifier = importMatch[1] as string;
      if (climbsOutAndReenters(specifier, context, fileDirDepth)) {
        violations.push(`${file} -> ${specifier}`);
      }
    }
  }
  return violations.sort();
}

/** Empty on purpose: a file that fails this test is fixed, never listed. */
const BASELINE: string[] = [];

describe("a context reaches its own interior directly, never by climbing out and back in", () => {
  it("no file re-enters its own context under its own name", () => {
    const violations = selfReentryViolations(sourceFiles());

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "a new import climbs out of its own context and back in").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a specifier that climbs out of its context root and spells the context back out", () => {
    // From `contexts/acme/application/`, three `..` clear application, acme and contexts.
    expect(climbsOutAndReenters("../../../contexts/acme/domain/y.js", "acme", 4)).toBe(true);
    expect(climbsOutAndReenters("../../../acme/domain/y.js", "acme", 4)).toBe(true);
  });

  it("clears a specifier that stays inside the context, however far it climbs", () => {
    // One `..` from `application/plugin/` reaches `application/`, still inside the context.
    expect(
      climbsOutAndReenters("../framework/translator/plugin-translator.js", "framework", 5)
    ).toBe(false);
    expect(climbsOutAndReenters("../domain/ports/version-control.js", "telemetry", 4)).toBe(false);
  });

  it("ignores a specifier that does not climb at all", () => {
    expect(climbsOutAndReenters("./sibling.js", "acme", 4)).toBe(false);
  });

  it("does not flag a real cross-context edge, which climbs out and never comes back", () => {
    expect(
      climbsOutAndReenters(
        "../../../contexts/tools/domain/formats/cursor-hooks-project-merge.js",
        "telemetry",
        4
      )
    ).toBe(false);
  });
});
