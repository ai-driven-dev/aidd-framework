/**
 * The shape of dead code knip cannot see: a port declares a method, an adapter implements it,
 * both reference the name, and nobody checks a *caller* exists. Deliberately coarse — it asks
 * whether `.someMethod(` appears anywhere outside the port's own file, so it proves only that
 * nothing spells the name as a call, never that a real path reaches it.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { CLI_ROOT, expectRatchet, SRC, sourceFiles } from "./helpers.js";

/** "ports" must be its own path segment: a substring check also matches `supports/` and
 * `reports/`. */
function portFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".ts") && /(^|\/)ports\//.test(full.split(sep).join("/"))) {
        out.push(relative(CLI_ROOT, full));
      }
    }
  };
  walk(SRC);
  return out.sort();
}

const INTERFACE_BLOCK = /^export interface (\w+) \{([\s\S]*?)\n\}/gm;
const METHOD_SIGNATURE = /^ {2}(\w+)\(/gm;

function declaredMethods(file: string, source: string): string[] {
  const declared: string[] = [];
  for (const block of source.matchAll(INTERFACE_BLOCK)) {
    for (const method of (block[2] as string).matchAll(METHOD_SIGNATURE)) {
      declared.push(`${file} :: ${block[1]}.${method[1]}`);
    }
  }
  return declared;
}

/** Empty, and it stays empty: an uncalled port method is a missing caller or a dead
 * declaration, and both are closed by fixing the code rather than recording it. */
const BASELINE: readonly string[] = [];

function uncalledMethods(bodies: ReadonlyMap<string, string>, ports: readonly string[]): string[] {
  const uncalled: string[] = [];
  for (const port of ports) {
    for (const declared of declaredMethods(port, bodies.get(port) ?? "")) {
      const method = declared.slice(declared.lastIndexOf(".") + 1);
      const called = [...bodies].some(
        ([file, body]) => file !== port && new RegExp(`\\.${method}\\s*\\(`).test(body)
      );
      if (!called) uncalled.push(declared);
    }
  }
  return uncalled.sort();
}

describe("a port declares nothing nobody calls", () => {
  it("every method a port declares is spelled as a call somewhere in src", () => {
    const bodies = new Map(
      sourceFiles().map((file) => [file, readFileSync(join(CLI_ROOT, file), "utf8")])
    );

    const uncalled = uncalledMethods(bodies, portFiles());

    const { added, fixed } = expectRatchet(uncalled, BASELINE);
    expect(
      added,
      "a port declares a method nothing calls — an adapter implementing it is not a caller"
    ).toEqual([]);
    expect(fixed, "fixed — remove these from BASELINE").toEqual([]);
  });

  it("finds the ports of this codebase, so the rule cannot pass by selecting nothing", () => {
    expect(
      portFiles().length,
      "no port file found — the scope of this rule is stale"
    ).toBeGreaterThan(10);
  });
});

describe("the guard itself", () => {
  it("names the port method nothing spells as a call, and clears the one a caller spells", () => {
    const port = "src/kernel/ports/thing.ts";
    const bodies = new Map([
      [
        port,
        ["export interface Thing {", "  doIt(x: number): void;", "  gone(): void;", "}"].join("\n"),
      ],
      ["src/runtime/caller.ts", "thing.doIt(1);"],
    ]);

    expect(uncalledMethods(bodies, [port])).toEqual([`${port} :: Thing.gone`]);
  });

  it("does not read an adapter implementing a method as a caller of it", () => {
    const port = "src/kernel/ports/thing.ts";
    const bodies = new Map([
      [port, ["export interface Thing {", "  doIt(x: number): void;", "}"].join("\n")],
      ["src/runtime/thing-adapter.ts", "class ThingAdapter { doIt(x: number): void {} }"],
    ]);

    expect(uncalledMethods(bodies, [port])).toEqual([`${port} :: Thing.doIt`]);
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
});
