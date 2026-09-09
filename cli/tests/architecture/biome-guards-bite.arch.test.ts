/**
 * Two rules live in biome rather than here: `process.exit` below the command edge, through
 * the GritQL plugin, and `export default` under src/ and tests/. A rule biome silently stops
 * applying is invisible, so the plugin and the override are proven on a planted tree.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_ROOT, read } from "./helpers.js";

const BIOME = join(CLI_ROOT, "node_modules", ".bin", "biome");
const PLUGIN = "biome-plugins/no-process-exit.grit";

/** The diagnostics biome prints for one planted tree, as `<file>:<rule>` lines. */
function biomeFindings(projectDir: string): string[] {
  const result = spawnSync(BIOME, ["lint", "--reporter=github", "."], {
    cwd: projectDir,
    encoding: "utf8",
  });
  const lines = `${result.stdout}\n${result.stderr}`.split("\n");
  return lines
    .map((line) => /^\s*::(?:error|warning) title=(\S+),file=(\S+?),/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => `${match[2]}:${match[1]}`)
    .sort();
}

describe("biome carries the exit and default-export rules", () => {
  it("scopes the process.exit plugin to the layers that throw, and to nothing else", () => {
    const config = JSON.parse(read("biome.json")) as {
      overrides?: { includes?: string[]; plugins?: string[] }[];
    };
    const carrier = (config.overrides ?? []).find((o) => o.plugins?.includes(`./${PLUGIN}`));
    expect(carrier?.includes, `no override applies ${PLUGIN}`).toEqual([
      "src/kernel/**",
      "src/contexts/**",
      "src/runtime/**",
    ]);
  });
});

describe("the guard itself", () => {
  let planted: string;

  beforeAll(() => {
    planted = mkdtempSync(join(tmpdir(), "aidd-biome-bite-"));
    cpSync(join(CLI_ROOT, "biome.json"), join(planted, "biome.json"));
    cpSync(join(CLI_ROOT, "biome-plugins"), join(planted, "biome-plugins"), { recursive: true });
    for (const dir of ["src/kernel", "src/presentation", "tests/kernel"]) {
      mkdirSync(join(planted, dir), { recursive: true });
    }
    writeFileSync(
      join(planted, "src/kernel/exit.ts"),
      "export const stop = (): never => process.exit(1);\n"
    );
    writeFileSync(
      join(planted, "src/presentation/exit.ts"),
      "export const stop = (): never => process.exit(1);\n"
    );
    writeFileSync(
      join(planted, "src/kernel/default.ts"),
      "const value = 1;\nexport default value;\n"
    );
    writeFileSync(
      join(planted, "tests/kernel/default.ts"),
      "const value = 1;\nexport default value;\n"
    );
    writeFileSync(join(planted, "src/kernel/clean.ts"), "export const one = 1;\n");
  });

  afterAll(() => {
    rmSync(planted, { recursive: true, force: true });
  });

  it("flags process.exit under kernel/, contexts/ and runtime/, and leaves the command edge alone", () => {
    const findings = biomeFindings(planted);
    expect(findings).toContain("src/kernel/exit.ts:plugin");
    expect(findings.filter((f) => f.startsWith("src/presentation/"))).toEqual([]);
  });

  it("flags a default export under src/ and tests/ alike, and a clean module not at all", () => {
    const findings = biomeFindings(planted);
    expect(findings).toContain("src/kernel/default.ts:lint/style/noDefaultExport");
    expect(findings).toContain("tests/kernel/default.ts:lint/style/noDefaultExport");
    expect(findings.filter((f) => f.startsWith("src/kernel/clean.ts"))).toEqual([]);
  });
});
