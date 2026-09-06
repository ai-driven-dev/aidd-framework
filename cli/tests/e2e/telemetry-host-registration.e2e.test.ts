import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cliPath, pathWithoutAidd } from "./helpers.js";

const execFileAsync = promisify(execFile);

/**
 * #703 end to end, on the built binary: a project whose plugins are declared, and a host
 * registry that carries one of them and not the other.
 *
 * The point of running it here rather than only in unit tests is the cost of the answer. The
 * whole design exists so this question is answerable **before** anyone has spent a session:
 * no AI tool on `PATH`, no network, no account, no money — only files already on disk. If
 * that ever stopped being true, it would stop here first.
 */
const PLUGIN_SOURCE = { kind: "github", repo: "ai-driven-dev/framework" } as const;

function pluginEntry(name: string, marketplace?: string) {
  return {
    name,
    source: PLUGIN_SOURCE,
    version: "1.0.0",
    strict: true,
    files: {},
    scope: "project",
    ...(marketplace === undefined ? {} : { marketplace }),
  };
}

describe("check says whether the host will load what aidd installed", () => {
  let projectDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), "aidd-host-registration-e2e-"));
    projectDir = join(root, "project");
    fakeHome = join(root, "home");
    await mkdir(join(projectDir, ".aidd"), { recursive: true });
    await mkdir(join(fakeHome, ".claude", "plugins"), { recursive: true });
    await writeFile(
      join(projectDir, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true } })
    );
    await writeFile(
      join(projectDir, ".aidd", "manifest.json"),
      JSON.stringify({
        version: 7,
        tools: {
          claude: {
            files: [],
            mergeFiles: [],
            plugins: [
              pluginEntry("aidd-telemetry", "aidd-framework"),
              pluginEntry("aidd-dev", "aidd-framework"),
              pluginEntry("hand-copied"),
            ],
          },
        },
      })
    );
    // Only the first is registered, and it names this project — which is how `aidd` installs,
    // at project scope (`native-plugin-cli-adapter.ts`'s own `--scope project`).
    await writeFile(
      join(fakeHome, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [{ scope: "project", projectPath: projectDir }],
        },
      })
    );
  });

  afterEach(async () => {
    await rm(join(projectDir, ".."), { recursive: true, force: true });
  });

  it("names each plugin's answer, with no AI tool on PATH and nothing to spend", async () => {
    const { stdout } = await execFileAsync(process.execPath, [cliPath(), "telemetry", "check"], {
      cwd: projectDir,
      env: {
        PATH: pathWithoutAidd(),
        HOME: fakeHome,
        AIDD_TELEMETRY_DIR: join(fakeHome, "telemetry"),
      },
    });

    expect(stdout).toContain("plugins registered");
    // The failure #703 is about: declared, and the host will drop it as orphaned.
    expect(stdout).toContain("claude/aidd-dev: not-registered");
    // No marketplace recorded, so no registry keys on it — unanswerable, never "not there".
    expect(stdout).toContain("claude/hand-copied: unanswerable");
    expect(stdout).toContain("claude/aidd-telemetry: registered");
    // Problem first: a person who reads one line reads the one they must act on.
    expect(stdout.indexOf("aidd-dev")).toBeLessThan(stdout.indexOf("aidd-telemetry: registered"));
  });

  it("does not count a registration made for a different project", async () => {
    await writeFile(
      join(fakeHome, ".claude", "plugins", "installed_plugins.json"),
      JSON.stringify({
        version: 1,
        plugins: {
          "aidd-telemetry@aidd-framework": [{ scope: "project", projectPath: "/somewhere/else" }],
        },
      })
    );

    const { stdout } = await execFileAsync(process.execPath, [cliPath(), "telemetry", "check"], {
      cwd: projectDir,
      env: {
        PATH: pathWithoutAidd(),
        HOME: fakeHome,
        AIDD_TELEMETRY_DIR: join(fakeHome, "telemetry"),
      },
    });

    expect(stdout).toContain("claude/aidd-telemetry: not-registered");
  });
});
