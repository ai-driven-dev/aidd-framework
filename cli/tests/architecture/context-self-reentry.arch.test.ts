/**
 * A context never has to leave itself to reach its own interior.
 *
 * `context-boundary.arch.test.ts` holds the boundary a context draws around what it
 * exposes to others. This one holds something narrower and mechanical: a file inside
 * `src/contexts/<X>/` whose import specifier climbs above `src/contexts/<X>/` and then
 * spells the context's own name back out — `contexts/<X>/...` or `<X>/...` — to land on
 * a module that was reachable directly, one or two `..` short of where the specifier
 * actually stops. Telemetry picked up thirteen of these after a mechanical rewrite moved
 * files without shortening what they pointed at; two more predate it in `tools`, carried
 * here as a baseline this rule may only shrink, not grow.
 *
 * This is a scar, not a boundary violation: every one of these targets is already public
 * or already internal-and-adjacent, so `context-boundary.arch.test.ts` has nothing to say
 * about it. A real cross-context edge — a `telemetry` file naming `contexts/tools/...` —
 * climbs out and never comes back to `telemetry`, so it is not a case of this rule.
 */
import { describe, expect, it } from "vitest";
import { expectRatchet, INTERNAL_IMPORT, read, sourceFiles } from "./helpers.js";

/** `src/contexts/<X>/` is always three path segments. */
const CONTEXT_ROOT_DEPTH = 3;

/**
 * Whether a specifier written from inside `context`, at `fileDirDepth` segments deep,
 * climbs at least out of `src/contexts/<context>/` before it starts descending again, and
 * spells `context` right back out on the way down — `contexts/<context>/...` or bare
 * `<context>/...`. A specifier that only climbs within the context (`../framework/...`
 * from `application/plugin/` down into a real `application/framework/` subdirectory) never
 * reaches this depth and is left alone.
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

/** Every self-reentry scar found in the real tree today. */
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

/** Empty on purpose: the two profiles that climbed out of `tools` and back in were
 * shortened when this rule landed. A file that fails this test is fixed, never listed. */
const BASELINE: string[] = [];

describe("a context reaches its own interior directly, never by climbing out and back in", () => {
  it("no file re-enters its own context under its own name", () => {
    const violations = selfReentryViolations(sourceFiles());

    const { added, fixed } = expectRatchet(violations, BASELINE);
    expect(added, "a new import climbs out of its own context and back in").toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("flags a specifier that climbs out of its context root and spells the context back out", () => {
    // src/contexts/acme/application/x.ts, three `..` clears application (1), acme (2), contexts (3)
    expect(climbsOutAndReenters("../../../contexts/acme/domain/y.js", "acme", 4)).toBe(true);
    expect(climbsOutAndReenters("../../../acme/domain/y.js", "acme", 4)).toBe(true);
  });

  it("clears a specifier that stays inside the context, however far it climbs", () => {
    // one `..` from application/plugin/ only reaches application/ — still inside `framework`
    expect(
      climbsOutAndReenters("../framework/translator/plugin-translator.js", "framework", 5)
    ).toBe(false);
    // a same-directory or shallow sibling import never starts with enough `..` to exit
    expect(climbsOutAndReenters("../domain/ports/version-control.js", "telemetry", 4)).toBe(false);
  });

  it("ignores a specifier that does not climb at all", () => {
    expect(climbsOutAndReenters("./sibling.js", "acme", 4)).toBe(false);
  });

  it("does not flag a real cross-context edge, which climbs out and never comes back", () => {
    // telemetry -> contexts/tools never spells `telemetry` back out on the way down
    expect(
      climbsOutAndReenters(
        "../../../contexts/tools/domain/formats/cursor-hooks-project-merge.js",
        "telemetry",
        4
      )
    ).toBe(false);
  });
});
