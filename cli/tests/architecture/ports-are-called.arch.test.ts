/**
 * Every method a port declares is called by something.
 *
 * This is the shape of dead code `knip` cannot see, and the reason it cannot: a port
 * declares a method and an adapter implements it, so both files reference the name and the
 * tool counts them as used. Nobody checks that a *caller* exists.
 *
 * Four methods lived that way. `FileMerger.hasLocalChanges` duplicated drift detection that
 * happens elsewhere; `FileMerger.backup` wrote a file nothing asked for;
 * `AssetProvider.loadDefaultMarketplace` bundled a JSON asset into the binary for nobody;
 * and `MarketplaceCachePort.list` dragged an entity, its error and three private helpers
 * behind it, reading a metadata file that nothing in this repository writes — so the value
 * it returned could not exist. The same blindness kept `GitAdapter.installPreCommitDelegate`
 * alive from the day it arrived.
 *
 * The check is deliberately coarse: it asks whether `.someMethod(` appears anywhere in `src`
 * outside the port's own file. A method sharing a name with an unrelated one reads as called,
 * so this cannot prove a port method is reached on a real path — only that nothing, anywhere,
 * spells its name as a call. That is the case it exists to catch, and every one of the four
 * above was exactly that.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, expectRatchet, SRC, sourceFiles } from "./helpers.js";

/** Files under any `ports/` directory — where this codebase keeps its interfaces. */
function portFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && full.includes(`${join("", "ports")}${"/"}`)) {
        out.push(relative(CLI_ROOT, full));
      }
    }
  };
  walk(SRC);
  return out.sort();
}

const INTERFACE_BLOCK = /^export interface (\w+) \{([\s\S]*?)\n\}/gm;
const METHOD_SIGNATURE = /^ {2}(\w+)\(/gm;

/** Every `Interface.method` a port file declares. */
function declaredMethods(file: string, source: string): string[] {
  const declared: string[] = [];
  for (const block of source.matchAll(INTERFACE_BLOCK)) {
    for (const method of (block[2] as string).matchAll(METHOD_SIGNATURE)) {
      declared.push(`${file} :: ${block[1]}.${method[1]}`);
    }
  }
  return declared;
}

/** Empty, and it stays empty: a port that declares a method nothing calls is either a
 * caller that was never written or a declaration that outlived its reason, and both are
 * closed by fixing the code rather than by recording it here. */
const BASELINE: readonly string[] = [];

describe("a port declares nothing nobody calls", () => {
  it("every method a port declares is spelled as a call somewhere in src", () => {
    const bodies = new Map(
      sourceFiles().map((file) => [file, readFileSync(join(CLI_ROOT, file), "utf8")])
    );

    const uncalled: string[] = [];
    for (const port of portFiles()) {
      for (const declared of declaredMethods(port, bodies.get(port) ?? "")) {
        const method = declared.slice(declared.lastIndexOf(".") + 1);
        const called = [...bodies].some(
          ([file, body]) => file !== port && new RegExp(`\\.${method}\\s*\\(`).test(body)
        );
        if (!called) uncalled.push(declared);
      }
    }

    const { added, fixed } = expectRatchet(uncalled.sort(), BASELINE);
    expect(
      added,
      "a port declares a method nothing calls — an adapter implementing it is not a caller"
    ).toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("reads a method off an interface block and ignores a property", () => {
    const source = [
      "export interface Thing {",
      "  readonly name: string;",
      "  doIt(x: number): void;",
      "}",
    ].join("\n");

    expect(declaredMethods("src/kernel/ports/thing.ts", source)).toEqual([
      "src/kernel/ports/thing.ts :: Thing.doIt",
    ]);
  });

  it("finds the ports of this codebase, so the rule cannot pass by selecting nothing", () => {
    expect(
      portFiles().length,
      "no port file found — the scope of this rule is stale"
    ).toBeGreaterThan(10);
  });
});
