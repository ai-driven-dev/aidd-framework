import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// Every tool, because `enabledPluginsCandidates` walks the whole registry: a partial
// registration throws before a single assertion is reached.
import "../../../../src/contexts/tools/domain/profiles/claude/profile.js";
import "../../../../src/contexts/tools/domain/profiles/codex/profile.js";
import "../../../../src/contexts/tools/domain/profiles/copilot/profile.js";
import "../../../../src/contexts/tools/domain/profiles/cursor/profile.js";
import "../../../../src/contexts/tools/domain/profiles/opencode/profile.js";
import { TelemetryEvidenceAdapter } from "../../../../src/contexts/telemetry/infrastructure/telemetry-evidence-adapter.js";

/**
 * The adapter every other telemetry command asks first.
 *
 * It answers whether measurement is allowed here, whether anything is declared to do the
 * recording, and what a tool's own settings file still carries — so a wrong answer here
 * does not produce a wrong figure, it produces no figures at all, or figures nobody asked
 * to be collected. That is why it is tested against real files rather than a double: every
 * one of its answers is a read of a path this build also writes, and the two must not
 * drift.
 *
 * `HOME` is pointed at a throwaway directory for every case, because
 * `readRecorderDeclaration` checks the user-scope Claude settings file as one of its
 * locations. Left at the real value, a developer who happens to have the plugin enabled
 * globally would see these pass for the wrong reason.
 */
const created: string[] = [];
const savedHome = process.env.HOME;

afterEach(() => {
  if (savedHome === undefined) delete process.env.HOME;
  else process.env.HOME = savedHome;
  for (const dir of created) rmSync(dir, { recursive: true, force: true });
  created.length = 0;
});

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "aidd-evidence-"));
  created.push(root);
  process.env.HOME = join(root, "home");
  mkdirSync(process.env.HOME, { recursive: true });
  return join(root, "project");
}

function write(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

function writeJson(path: string, value: unknown): void {
  write(path, JSON.stringify(value, null, 2));
}

const adapter = () => new TelemetryEvidenceAdapter();

describe("whether measurement is allowed here", () => {
  it("reads a project that turned it on", async () => {
    const root = project();
    writeJson(join(root, ".aidd", "config.json"), { telemetry: { enabled: true } });

    expect(await adapter().isTelemetryEnabled(root, {})).toBe(true);
  });

  it("reads a project that never decided as off, without a file to read", async () => {
    expect(await adapter().isTelemetryEnabled(project(), {})).toBe(false);
  });

  // The person's own refusal outranks the project's file — the rule `telemetry-switch.ts`
  // states and `repo.cjs` mirrors for the hook, checked here on the route the CLI takes.
  it("lets a person refuse in their own environment, over a project that turned it on", async () => {
    const root = project();
    writeJson(join(root, ".aidd", "config.json"), { telemetry: { enabled: true } });

    expect(await adapter().isTelemetryEnabled(root, { AIDD_TELEMETRY: "0" })).toBe(false);
  });

  it("treats a switch file that is not JSON as off, never as on", async () => {
    const root = project();
    write(join(root, ".aidd", "config.json"), "{ telemetry: enabled, }");

    expect(await adapter().isTelemetryEnabled(root, {})).toBe(false);
  });
});

describe("what the switch setup reports, beside the answer itself", () => {
  it("names the file it read, and reads a damaged one as unreadable rather than off", async () => {
    const root = project();
    write(join(root, ".aidd", "config.json"), "not json at all");

    const setup = await adapter().readSwitchSetup(root);

    expect(setup.path).toBe(join(root, ".aidd", "config.json"));
    expect(setup.readable).toBe(false);
    expect(setup.enabled).toBe(false);
  });

  // An absent file is a project that never chose, which is a different fact from one whose
  // file cannot be read — and only the second is something wrong.
  it("reads an absent file as readable and undecided", async () => {
    const setup = await adapter().readSwitchSetup(project());

    expect(setup.readable).toBe(true);
    expect(setup.enabled).toBe(false);
  });
});

describe("whether anything is declared to do the recording", () => {
  it("finds the recorder in the manifest a plugin install writes", async () => {
    const root = project();
    writeJson(join(root, ".aidd", "manifest.json"), {
      tools: { claude: { plugins: [{ name: "aidd-telemetry", version: "1.0.0" }] } },
    });

    const declaration = await adapter().readRecorderDeclaration(root);

    expect(declaration.declared).toBe(true);
    expect(declaration.declaredAt).toContain(join(root, ".aidd", "manifest.json"));
  });

  // The marketplace half of the key is this project's own choice, so the match is on the
  // plugin's name and the `@` that follows it, never the whole key.
  it("finds it in enabledPlugins whatever marketplace the key names", async () => {
    const root = project();
    writeJson(join(root, ".claude", "settings.json"), {
      enabledPlugins: { "aidd-telemetry@some-marketplace": true },
    });

    expect((await adapter().readRecorderDeclaration(root)).declared).toBe(true);
  });

  it("finds it in a Claude hooks block that names the entry point by its plugin token", async () => {
    const root = project();
    writeJson(join(root, ".claude", "settings.local.json"), {
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: "command",
                // biome-ignore lint/suspicious/noTemplateCurlyInString: Claude Code resolves this placeholder, the settings file carries it verbatim
                command: "node ${CLAUDE_PLUGIN_ROOT}/hooks/journal.cjs session-start",
              },
            ],
          },
        ],
      },
    });

    expect((await adapter().readRecorderDeclaration(root)).declared).toBe(true);
  });

  // A bare `journal.cjs` is any plugin's journal, not this one's — matching it would read
  // somebody else's hook as this recorder being installed.
  it("refuses a hooks block naming a bare journal.cjs belonging to some other plugin", async () => {
    const root = project();
    writeJson(join(root, ".cursor", "hooks.json"), {
      version: 1,
      hooks: { SessionStart: [{ command: "node ./somewhere-else/journal.cjs" }] },
    });

    expect((await adapter().readRecorderDeclaration(root)).declared).toBe(false);
  });

  it("reports nothing declared, and still names every location it looked in", async () => {
    const declaration = await adapter().readRecorderDeclaration(project());

    expect(declaration.declared).toBe(false);
    expect(declaration.declaredAt).toEqual([]);
    expect(declaration.locationsChecked.length).toBeGreaterThan(3);
    expect(new Set(declaration.locationsChecked).size).toBe(declaration.locationsChecked.length);
  });

  // A file that is there and damaged is not a file that says "not declared": the first is
  // something to fix, the second is an ordinary state.
  it("names a damaged location as unreadable rather than counting it as undeclared", async () => {
    const root = project();
    write(join(root, ".aidd", "manifest.json"), "{ tools: ");

    const declaration = await adapter().readRecorderDeclaration(root);

    expect(declaration.unreadable).toContain(join(root, ".aidd", "manifest.json"));
    expect(declaration.declared).toBe(false);
  });
});

describe("a payload that matched no known host", () => {
  it("reads the moment one arrived", async () => {
    const root = project();
    write(
      join(root, "aidd_docs", "runs", "_unrecognised.jsonl"),
      `${JSON.stringify({ type: "unrecognised_payload", at: "2026-03-02T08:00:00Z" })}\n`
    );

    expect(await adapter().readUnrecognisedPayload(root)).toEqual({ at: "2026-03-02T08:00:00Z" });
  });

  it("answers nothing when the file is absent", async () => {
    expect(await adapter().readUnrecognisedPayload(project())).toBeNull();
  });

  it("answers nothing for a line that is not one of these records", async () => {
    const root = project();
    write(join(root, "aidd_docs", "runs", "_unrecognised.jsonl"), '{"type":"something-else"}\n');

    expect(await adapter().readUnrecognisedPayload(root)).toBeNull();
  });

  // The hook that writes this file anchors at the repository root (`git rev-parse
  // --show-toplevel`), never at the directory a session happened to start from. A reader
  // that joined straight onto `projectRoot` instead of walking up to that same root missed
  // the file whenever a command ran from a subdirectory of the checkout.
  it("finds the file from a subdirectory of the repository, not only from its root", async () => {
    const root = project();
    mkdirSync(join(root, ".git"), { recursive: true });
    write(
      join(root, "aidd_docs", "runs", "_unrecognised.jsonl"),
      `${JSON.stringify({ type: "unrecognised_payload", at: "2026-03-02T08:00:00Z" })}\n`
    );
    const subdirectory = join(root, "packages", "app");
    mkdirSync(subdirectory, { recursive: true });

    expect(await adapter().readUnrecognisedPayload(subdirectory)).toEqual({
      at: "2026-03-02T08:00:00Z",
    });
  });
});

describe("an export a deleted command left behind in a tool's own settings", () => {
  it("names the file and the keys still in it", async () => {
    const root = project();
    writeJson(join(root, ".claude", "settings.json"), {
      env: {
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://example.invalid",
        CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      },
    });

    const leftovers = await adapter().findLeftoverExportConfig(root);

    expect(leftovers).toHaveLength(1);
    expect(leftovers[0]?.path).toBe(join(root, ".claude", "settings.json"));
    expect(leftovers[0]?.keys.length).toBeGreaterThan(0);
  });

  it("finds none in a project whose settings carry no export at all", async () => {
    const root = project();
    writeJson(join(root, ".claude", "settings.json"), { env: {} });

    expect(await adapter().findLeftoverExportConfig(root)).toEqual([]);
  });
});
