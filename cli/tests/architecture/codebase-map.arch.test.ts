/**
 * `codebase-map.md` is the single place that says where things live, and a map maintained by
 * hand drifts both ways. The comparison is over full paths reconstructed from the tree block's
 * indentation — comparing names alone reads `application/` as present wherever it exists — and
 * it runs in both directions: an invented directory sends a reader to create a file there.
 */
import { describe, expect, it } from "vitest";
import { read, sourceFiles } from "./helpers.js";

const MAP = "aidd_docs/memory/codebase-map.md";

/** The fenced block whose first line is `src/`. */
function sourceTreeBlock(text: string): string {
  for (const match of text.matchAll(/```[a-z]*\n([\s\S]*?)```/g)) {
    const body = match[1] as string;
    if (body.trimStart().startsWith("src/")) return body;
  }
  throw new Error(`${MAP} has no fenced block drawing the source tree`);
}

/** One tree entry: four prefix characters per level, then a branch marker and a name. */
const TREE_ENTRY = /^([│\s]*)(?:├──|└──)\s+([A-Za-z0-9_.-]+)(\/?)/;
const LEVEL_WIDTH = 4;

function drawnDirectoriesInText(block: string): Set<string> {
  const drawn = new Set<string>();
  const stack: string[] = [];
  for (const line of block.split("\n")) {
    const entry = TREE_ENTRY.exec(line);
    if (entry === null) continue;
    const depth = (entry[1] as string).length / LEVEL_WIDTH;
    stack.length = depth;
    stack[depth] = entry[2] as string;
    if (entry[3] === "/") drawn.add(`src/${stack.slice(0, depth + 1).join("/")}`);
  }
  return drawn;
}

function drawnDirectories(): Set<string> {
  return drawnDirectoriesInText(sourceTreeBlock(read(MAP)));
}

function realDirectories(): Set<string> {
  const real = new Set<string>();
  for (const file of sourceFiles()) {
    const segments = file.split("/").slice(0, -1);
    for (let i = 2; i <= segments.length; i += 1) real.add(segments.slice(0, i).join("/"));
  }
  return real;
}

function disagreements(
  real: ReadonlySet<string>,
  drawn: ReadonlySet<string>
): { undocumented: string[]; invented: string[] } {
  return {
    undocumented: [...real].filter((dir) => !drawn.has(dir)).sort(),
    invented: [...drawn].filter((dir) => !real.has(dir)).sort(),
  };
}

describe("the codebase map matches the tree", () => {
  it("draws every directory that holds source, and no directory that does not exist", () => {
    const { undocumented, invented } = disagreements(realDirectories(), drawnDirectories());

    expect(undocumented, `${MAP} is silent about these directories`).toEqual([]);
    expect(invented, `${MAP} draws these directories and they do not exist`).toEqual([]);
  });
});

describe("the guard itself", () => {
  it("reads a path from the indentation, so the same name under two parents is two paths", () => {
    const block = [
      "src/",
      "├── kernel/           # shared vocabulary",
      "└── contexts/         # bounded contexts",
      "    ├── tools/        # what the project targets",
      "    │   └── domain/   # its rules",
      "    └── ghost/        # invented",
    ].join("\n");

    expect(drawnDirectoriesInText(block)).toEqual(
      new Set([
        "src/kernel",
        "src/contexts",
        "src/contexts/tools",
        "src/contexts/tools/domain",
        "src/contexts/ghost",
      ])
    );
  });

  it("names a real directory the map omits, an invented one it draws, nothing when they agree", () => {
    const real = new Set(["src/kernel", "src/contexts/tools/domain"]);
    const drawn = new Set(["src/kernel", "src/contexts/tools/application"]);

    expect(disagreements(real, drawn)).toEqual({
      undocumented: ["src/contexts/tools/domain"],
      invented: ["src/contexts/tools/application"],
    });
    expect(disagreements(real, real)).toEqual({ undocumented: [], invented: [] });
  });
});
