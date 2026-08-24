const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { describe, it } = require("node:test");

const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/02-check/scripts");
const SHARED = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/02-check/scripts/lib");
const SCRIPT = path.join(SCRIPTS, "telemetry-check.js");
const { diagnose, OK, FAIL, UNKNOWN } = require(path.join(SCRIPTS, "lib/diagnose.js"));
const { printReport } = require(path.join(SCRIPTS, "lib/render.js"));
const { TOOLS } = require(path.join(SHARED, "readers.js"));
const { resolveSessionAnchor, resolveCurrentTool } = require(path.join(SCRIPTS, "lib/session-anchor.js"));
const { rootDir: exportSinkRootDir, findExportedRecordForSession } = require(
  path.join(SCRIPTS, "lib/export-sink.js"),
);
const { readClaudeExportConfig, readCodexExportConfig } = require(path.join(SCRIPTS, "lib/export-config.js"));
const { rootDir: costSinkRootDir } = require(
  path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts/lib/sink.js"),
);
const { UNRECOGNISED_FILE_NAME } = require("../../plugins/aidd-telemetry/hooks/lib/record.js");
const { readCodexHookTrust, parseHookTrust, PLUGIN_NAME } = require(path.join(SCRIPTS, "lib/hook-trust.js"));
const PLUGIN_MANIFEST = require("../../plugins/aidd-telemetry/.claude-plugin/plugin.json");

// A minimal PATH for spawned scripts, containing only git's own directory - never
// "/usr/bin:/bin", which doesn't hold git on Windows and uses ":" as a separator, not
// win32's ";". "where"/"which" differ by platform; either answers with the same thing,
// which is all a minimal PATH here needs (hooks/lib/repo.js shells out to git).
const GIT_DIR = path.dirname(
  execFileSync(process.platform === "win32" ? "where" : "which", ["git"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/u)[0],
);

const journalOf = (boundaries, vendorId = "s-1", at = "2026-08-20T09:00:00Z") => ({
  session: { vendor_id: vendorId, tool: "claude-code", at },
  boundaries,
});
const step = (at, skill) => ({ type: "step_start", at, skill });
const turnEnd = (at) => ({ type: "turn_end", at });
const record = (attribution) => ({ step_attribution: attribution });
const toolRead = (overrides) => ({
  tool: "claude",
  sessionFound: true,
  records: [],
  hasIntervals: false,
  ...overrides,
});

// The pure verdicts, each read from hand-built inputs rather than a real session: what
// makes a claim FAIL is a property of the shape it is handed, never of how that shape was
// produced.
// Two anchors, only these two: each was read because a live probe measured it, recorded
// in aidd_docs/tasks/2026_08/2026_08_21_telemetry-v1-close/measurements.md under "Per-tool
// session anchor, measured live".
describe("resolving which session is actually running this script", () => {
  it("reads Codex's own variable when it is the only one set", () => {
    assert.equal(resolveSessionAnchor({ CODEX_THREAD_ID: "codex-1" }), "codex-1");
  });

  it("reads Claude Code's variable when Codex's is absent", () => {
    assert.equal(resolveSessionAnchor({ CLAUDE_CODE_SESSION_ID: "claude-1" }), "claude-1");
  });

  it("prefers Codex's variable when both are set, because that is the nested case", () => {
    // A Codex process launched inside a Claude Code session inherits CLAUDE_CODE_SESSION_ID
    // from its parent (measured in hooks/lib/host.js already), so seeing both set is not
    // ambiguous - it names exactly the process actually running this script.
    const env = { CODEX_THREAD_ID: "codex-nested", CLAUDE_CODE_SESSION_ID: "claude-parent" };

    assert.equal(resolveSessionAnchor(env), "codex-nested");
  });

  it("reads no anchor at all when neither is set", () => {
    assert.equal(resolveSessionAnchor({}), undefined);
  });

  it("reads no anchor for a host neither variable was measured against", () => {
    // Copilot and Cursor were not probed this way: absent evidence, not assumed absence.
    assert.equal(resolveSessionAnchor({ COPILOT_SESSION_ID: "whatever" }), undefined);
  });
});

describe("naming which tool is currently running, for the export-route claims", () => {
  it("reads codex when only Codex's own variable is set", () => {
    assert.equal(resolveCurrentTool({ CODEX_THREAD_ID: "codex-1" }), "codex");
  });

  it("reads claude when only Claude Code's own variable is set", () => {
    assert.equal(resolveCurrentTool({ CLAUDE_CODE_SESSION_ID: "claude-1" }), "claude");
  });

  it("prefers Codex when both are set, the same nested-session reasoning resolveSessionAnchor follows", () => {
    const env = { CODEX_THREAD_ID: "codex-nested", CLAUDE_CODE_SESSION_ID: "claude-parent" };

    assert.equal(resolveCurrentTool(env), "codex");
  });

  it("names no tool at all when neither anchor is set", () => {
    assert.equal(resolveCurrentTool({}), undefined);
  });

  // Pinned against TOOLS (readers.js), the same source of truth hook-trust.js's own
  // hardcoded PLUGIN_NAME is pinned against: the two ids resolveCurrentTool can ever return
  // must stay ones export-config.js actually has a branch for, or that branch is dead code.
  it("only ever names a tool id TOOLS itself declares", () => {
    assert.ok(TOOLS.some((declaration) => declaration.tool === "claude"));
    assert.ok(TOOLS.some((declaration) => declaration.tool === "codex"));
  });
});

describe("reading Codex's own hook trust state", () => {
  // The exact key shape Codex writes, copied from genuinely-approved entries already
  // sitting in a live ~/.codex/config.toml on the machine this was measured on - not
  // invented, and not read off docs.
  const TRUSTED = [
    '[hooks.state."aidd-telemetry@aidd-framework:hooks/hooks.json:session_start:0:0"]',
    'trusted_hash = "sha256:4c274345bc102cf596c77c45138e332eac3330b2d23e675334cf42693369a9"',
    "",
  ].join("\n");

  const OTHER_PLUGIN_TRUSTED = [
    '[hooks.state."aidd-context@aidd-framework:hooks/hooks.json:session_start:0:0"]',
    'trusted_hash = "sha256:4c274345bc102cf596c77c45138e332eac3330b2d23e675334cf42693369a9"',
    "",
  ].join("\n");

  describe("parseHookTrust (pure)", () => {
    it("reads trusted once the exact key carries a trusted_hash", () => {
      assert.deepEqual(parseHookTrust(TRUSTED), { trusted: true });
    });

    it("reads not trusted when the file has no table for this plugin's hook at all - a fresh install, never approved", () => {
      assert.deepEqual(parseHookTrust(""), { trusted: false });
    });

    it("reads not trusted off another plugin's trusted entry - only this plugin's own key counts", () => {
      assert.deepEqual(parseHookTrust(OTHER_PLUGIN_TRUSTED), { trusted: false });
    });

    it("carries this plugin's own name, pinned against .claude-plugin/plugin.json so the two cannot drift", () => {
      assert.equal(PLUGIN_NAME, PLUGIN_MANIFEST.name);
    });
  });

  describe("readCodexHookTrust (fs-backed)", () => {
    function writeCodexConfig(home, content) {
      const dir = path.join(home, ".codex");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "config.toml"), content);
    }

    it("reads readable and trusted when config.toml carries this plugin's own trusted_hash", () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-hook-trust-"));
      writeCodexConfig(home, TRUSTED);

      assert.deepEqual(readCodexHookTrust(home), {
        readable: true,
        trusted: true,
        configPath: path.join(home, ".codex", "config.toml"),
      });
    });

    it("reads readable and not trusted when config.toml exists with no entry for this hook", () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-hook-trust-"));
      writeCodexConfig(home, '[projects."/tmp/x"]\ntrust_level = "trusted"\n');

      assert.deepEqual(readCodexHookTrust(home), {
        readable: true,
        trusted: false,
        configPath: path.join(home, ".codex", "config.toml"),
      });
    });

    it("says the state could not be read, rather than guessing untrusted, when config.toml does not exist", () => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-hook-trust-"));

      const result = readCodexHookTrust(home);

      assert.equal(result.readable, false);
      assert.match(result.reason, /config\.toml/);
    });
  });
});

describe("reading Claude Code's own export configuration", () => {
  function tempClaudeProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-export-config-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-export-config-home-"));
    return { root, home };
  }

  function writeSettings(dir, content) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.json"), JSON.stringify(content));
  }

  it("names it unconfigured when none of the three files carry an env block at all", () => {
    const { root, home } = tempClaudeProject();

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /CLAUDE_CODE_ENABLE_TELEMETRY/);
    assert.equal(result.identityDisabled, false);
  });

  it("reads configured off the local settings file, naming the endpoint it found", () => {
    const { root, home } = tempClaudeProject();
    writeSettings(path.join(root, ".claude"), {});
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1", OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" } }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, true);
    assert.match(result.configuredDetail, /127\.0\.0\.1:4318/);
  });

  it("names only the enable flag missing when the endpoint is already set", () => {
    const { root, home } = tempClaudeProject();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" } }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /CLAUDE_CODE_ENABLE_TELEMETRY/);
    assert.doesNotMatch(result.missingDetail, /OTEL_EXPORTER_OTLP_ENDPOINT/);
  });

  it("names only the endpoint missing when the enable flag is already set", () => {
    const { root, home } = tempClaudeProject();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1" } }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /OTEL_EXPORTER_OTLP_ENDPOINT/);
    assert.doesNotMatch(result.missingDetail, /CLAUDE_CODE_ENABLE_TELEMETRY=1 is not set/);
  });

  it("names a split configuration as such, not as either key missing, when each is set in a different file", () => {
    const { root, home } = tempClaudeProject();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({ env: { CLAUDE_CODE_ENABLE_TELEMETRY: "1" } }),
    );
    fs.writeFileSync(
      path.join(home, ".claude", "settings.json"),
      JSON.stringify({ env: { OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318" } }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /not together in the one file/);
    assert.match(result.missingDetail, /not measured here/);
  });

  it("names the disabling setting when OTEL_METRICS_INCLUDE_SESSION_ID=false is present, the exact case that matters", () => {
    const { root, home } = tempClaudeProject();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({
        env: {
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
          OTEL_METRICS_INCLUDE_SESSION_ID: "false",
        },
      }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.configured, true);
    assert.equal(result.identityDisabled, true);
    assert.match(result.identityDisabledDetail, /OTEL_METRICS_INCLUDE_SESSION_ID=false/);
  });

  it("does not read the disabling setting as present when it is anything other than the literal string \"false\"", () => {
    const { root, home } = tempClaudeProject();
    fs.mkdirSync(path.join(root, ".claude"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".claude", "settings.local.json"),
      JSON.stringify({
        env: {
          CLAUDE_CODE_ENABLE_TELEMETRY: "1",
          OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
          OTEL_METRICS_INCLUDE_SESSION_ID: "true",
        },
      }),
    );

    const result = readClaudeExportConfig(root, home);

    assert.equal(result.identityDisabled, false);
  });
});

describe("reading Codex's own export configuration", () => {
  function writeCodexConfig(home, content) {
    const dir = path.join(home, ".codex");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.toml"), content);
  }

  it("names it unconfigured, never having read a fault, when config.toml does not exist at all", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-codex-export-"));

    const result = readCodexExportConfig(home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /\[otel\]/);
  });

  it("names it unconfigured while the default statsig exporter is still in place, the third party nobody chose", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-codex-export-"));
    writeCodexConfig(home, '[otel]\nmetrics_exporter = "statsig"\n');

    const result = readCodexExportConfig(home);

    assert.equal(result.configured, false);
    assert.match(result.missingDetail, /statsig/);
  });

  it("reads configured once metrics_exporter is set to anything other than the default", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-codex-export-"));
    writeCodexConfig(home, '[otel]\nmetrics_exporter = "otlp"\n');

    const result = readCodexExportConfig(home);

    assert.equal(result.configured, true);
    assert.match(result.configuredDetail, /otlp/);
  });

  it("does not read a metrics_exporter key that sits under a different table", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-codex-export-"));
    writeCodexConfig(home, '[some_other_table]\nmetrics_exporter = "otlp"\n');

    const result = readCodexExportConfig(home);

    assert.equal(result.configured, false);
  });
});

describe("export-sink.js's rootDir stays identical to 01-cost's own sink.js", () => {
  // Both compute the same directory from the same env - pinned the same way switch.js's
  // predicate and lib/repo.js's git check are pinned against the hook's own copies, so a
  // change to one cannot silently leave the other reading a different machine's sink.
  it("resolves the same directory for the same HOME", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-sink-pin-"));
    const originalHome = process.env.HOME;
    const originalOverride = process.env.AIDD_USER_CONFIG_DIR;
    delete process.env.AIDD_USER_CONFIG_DIR;
    process.env.HOME = home;

    try {
      assert.equal(exportSinkRootDir(), costSinkRootDir());
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalOverride === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
      else process.env.AIDD_USER_CONFIG_DIR = originalOverride;
    }
  });
});

describe("reading an export-provenance record for a session, from the sink itself", () => {
  function withSinkHome(fn) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-sink-read-"));
    const originalHome = process.env.HOME;
    const originalOverride = process.env.AIDD_USER_CONFIG_DIR;
    delete process.env.AIDD_USER_CONFIG_DIR;
    process.env.HOME = home;
    try {
      fn(home);
    } finally {
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      if (originalOverride === undefined) delete process.env.AIDD_USER_CONFIG_DIR;
      else process.env.AIDD_USER_CONFIG_DIR = originalOverride;
    }
  }

  it("finds an export-provenance record naming this session, among others that do not", () => {
    withSinkHome((home) => {
      const dir = path.join(home, ".config", "aidd", "telemetry");
      fs.mkdirSync(dir, { recursive: true });
      const lines = [
        { provenance: "local-read", vendor_id: "s-1" },
        { provenance: "export", vendor_id: "s-other" },
        { provenance: "export", vendor_id: "s-1", vendor_field: "session.id" },
      ];
      fs.writeFileSync(
        path.join(dir, "2026-08-20.jsonl"),
        lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
      );

      const found = findExportedRecordForSession("s-1");

      assert.equal(found.vendor_field, "session.id");
    });
  });

  it("finds nothing when no day file exists at all, rather than throwing", () => {
    withSinkHome(() => {
      assert.equal(findExportedRecordForSession("s-1"), undefined);
    });
  });
});

describe("naming whether the hook fired", () => {
  it("reads ok once the current session's own run file is found among them", () => {
    const [claim] = diagnose({ journals: [journalOf([])], toolReads: [], currentSessionId: "s-1" });

    assert.equal(claim.verdict, OK);
    assert.match(claim.detail, /1 run file\(s\)/);
  });

  it("names the hook never having fired, not a broken install, when no run file appears", () => {
    const [claim] = diagnose({ journals: [], toolReads: [], currentSessionId: "s-1" });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /never been observed firing/);
  });

  it("names an unrecognised payload as its own fault, distinct from never firing, when the marker was read by name and carries when", () => {
    const [claim] = diagnose({
      journals: [],
      toolReads: [],
      currentSessionId: "s-1",
      unrecognisedPayload: { type: "unrecognised_payload", at: "2026-08-22T09:00:00Z" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /matched no known host/);
    assert.match(claim.detail, /2026-08-22T09:00:00Z/);
  });

  it("does not read a torn run file as an unrecognised payload - a session-less journal alone is not enough, only the marker actually read by name is", () => {
    // A run file always opens with session_start; `session: null` also happens for a torn
    // or corrupted one, which must not borrow the unrecognised-payload diagnosis just
    // because it looks the same shape as the marker. No `unrecognisedPayload` was read, so
    // this reads as the generic "never observed firing", not the specific claim.
    const [claim] = diagnose({
      journals: [{ session: null, boundaries: [] }],
      toolReads: [],
      currentSessionId: "s-1",
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /never been observed firing/);
    assert.doesNotMatch(claim.detail, /matched no known host/);
  });

  it("prefers the specific unrecognised-payload fault over the generic one, when both a session-less journal and the marker are present", () => {
    const [claim] = diagnose({
      journals: [{ session: null, boundaries: [] }],
      toolReads: [],
      currentSessionId: "s-1",
      unrecognisedPayload: { type: "unrecognised_payload", at: "2026-08-22T09:00:00Z" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /matched no known host/);
  });

  it("names this session as having left no run file, distinct from never firing, when an older one exists but not its own", () => {
    const [claim] = diagnose({
      journals: [journalOf([], "s-old", "2026-07-01T09:00:00Z")],
      toolReads: [],
      currentSessionId: "s-current",
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /this session left no run file/);
    assert.match(claim.detail, /2026-07-01T09:00:00Z/);
  });

  it("cannot tell whether this session's hook fired without an anchor, and says so rather than guessing ok", () => {
    const [claim] = diagnose({ journals: [journalOf([])], toolReads: [] });

    assert.equal(claim.verdict, UNKNOWN);
    assert.match(claim.detail, /no session anchor available/);
  });

  // The fix: an untrusted Codex hook and a hook that never fired both leave the
  // exact same empty journal - only reading the trust state itself tells them apart.
  it("names an untrusted hook, not never having fired, when Codex's own config says so", () => {
    const [claim] = diagnose({
      journals: [],
      toolReads: [],
      currentSessionId: "codex-1",
      hookTrust: { readable: true, trusted: false, configPath: "/home/.codex/config.toml" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /has not trusted this plugin's hook/);
    assert.match(claim.detail, /--dangerously-bypass-hook-trust/);
    assert.doesNotMatch(claim.detail, /never been observed firing/);
  });

  it("still names the generic never-fired fault once the hook is actually trusted - trust is not the explanation left", () => {
    const [claim] = diagnose({
      journals: [],
      toolReads: [],
      currentSessionId: "codex-1",
      hookTrust: { readable: true, trusted: true, configPath: "/home/.codex/config.toml" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /never been observed firing/);
  });

  it("says the trust state could not itself be read, rather than guessing, when Codex's config could not be opened", () => {
    const [claim] = diagnose({
      journals: [],
      toolReads: [],
      currentSessionId: "codex-1",
      hookTrust: { readable: false, reason: "/home/.codex/config.toml could not be read (ENOENT)" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /never been observed firing/);
    assert.match(claim.detail, /could not be read either/);
  });

  it("says nothing about trust for a tool with no trust gate - hookTrust absent leaves the claim exactly as before", () => {
    const [claim] = diagnose({ journals: [], toolReads: [], currentSessionId: "claude-1" });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /never been observed firing/);
    assert.doesNotMatch(claim.detail, /trust/);
  });

  it("names an untrusted hook for this session too, when an older session left a run file but this one did not", () => {
    const [claim] = diagnose({
      journals: [journalOf([], "s-old", "2026-07-01T09:00:00Z")],
      toolReads: [],
      currentSessionId: "codex-current",
      hookTrust: { readable: true, trusted: false, configPath: "/home/.codex/config.toml" },
    });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /has not trusted this plugin's hook/);
    assert.doesNotMatch(claim.detail, /this session left no run file/);
  });
});

describe("naming whether a session was journalled", () => {
  it("reads ok when a run file closed its turn", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a"), turnEnd("2026-08-20T09:05:00Z")])];

    const [, claim] = diagnose({ journals, toolReads: [] });

    assert.equal(claim.verdict, OK);
  });

  it("names a run file that carries only session_start, not a missing file", () => {
    const [, claim] = diagnose({ journals: [journalOf([])], toolReads: [] });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /only session_start/);
  });

  it("has nothing to read when no run file exists, and says so rather than failing", () => {
    const [, claim] = diagnose({ journals: [], toolReads: [] });

    assert.equal(claim.verdict, UNKNOWN);
  });
});

describe("naming whether the tool's own files can be read", () => {
  it("reads ok once one covered tool found the session", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a")])];

    const [, , claim] = diagnose({ journals, toolReads: [toolRead({ sessionFound: true })] });

    assert.equal(claim.verdict, OK);
  });

  it("names no session found for any tool, while the journal names one", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a")], "s-1")];
    const toolReads = [
      toolRead({ tool: "claude", sessionFound: false }),
      toolRead({ tool: "codex", sessionFound: false }),
    ];

    const [, , claim] = diagnose({ journals, toolReads });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /no session found/);
    assert.match(claim.detail, /s-1/);
  });

  it("has no session to look for when the journal names none", () => {
    const [, , claim] = diagnose({ journals: [], toolReads: [] });

    assert.equal(claim.verdict, UNKNOWN);
  });

  it("carries the count read against the count attempted, not just the tool that worked", () => {
    // 1 of 2 sessions read must never round up to a plain "read": the other session is
    // exactly the invisible-figure failure this claim exists to catch.
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a")], "s-1")];
    const toolReads = [
      toolRead({ tool: "claude", sessionFound: true }),
      toolRead({ tool: "claude", sessionFound: false }),
    ];

    const [, , claim] = diagnose({ journals, toolReads });

    assert.equal(claim.verdict, OK);
    assert.match(claim.detail, /claude: 1 of 2 session\(s\) read/);
  });

  it("names a reader that threw as failing to read, not as a plain miss", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a")], "s-1")];
    const toolReads = [
      toolRead({ tool: "claude", sessionFound: false }),
      toolRead({ tool: "codex", sessionFound: false, error: "ENOENT: no such file" }),
    ];

    const [, , claim] = diagnose({ journals, toolReads });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /1 read attempt\(s\) failed: ENOENT/);
  });
});

describe("naming whether the journal and the tool's records join", () => {
  it("reads ok once a record joined a step", () => {
    const toolReads = [toolRead({ hasIntervals: true, records: [record("journal-interval")] })];

    const [, , , claim] = diagnose({ journals: [], toolReads });

    assert.equal(claim.verdict, OK);
  });

  it("names every record unattributed, not a missing record", () => {
    const toolReads = [
      toolRead({ hasIntervals: true, records: [record("unattributed"), record("unattributed")] }),
    ];

    const [, , , claim] = diagnose({ journals: [], toolReads });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /unattributed/);
  });

  it("has nothing to join when no record was read", () => {
    const [, , , claim] = diagnose({ journals: [], toolReads: [toolRead({ records: [] })] });

    assert.equal(claim.verdict, UNKNOWN);
  });

  it("has nothing to join when neither a step interval nor a tool-stated step exists", () => {
    const toolReads = [toolRead({ hasIntervals: false, records: [record("unattributed")] })];

    const [, , , claim] = diagnose({ journals: [], toolReads });

    assert.equal(claim.verdict, UNKNOWN);
  });
});

// exportConfig fixtures below are hand-built to the shape export-config.js's two readers
// actually return (checked/configured/configuredDetail/missingDetail/identityDisabled/
// identityDisabledDetail) - proven wired to the real readers by the end-to-end suite further
// down, the same split the four claims above already draw between pure-verdict and wiring
// tests.
describe("naming whether the tool's own export is configured", () => {
  it("reads ok once the tool's own settings carry a working endpoint", () => {
    const exportConfig = { configured: true, configuredDetail: "OTLP to 127.0.0.1:4318 (.claude/settings.local.json)" };

    const [, , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig });

    assert.equal(claim.verdict, OK);
    assert.match(claim.detail, /127\.0\.0\.1:4318/);
  });

  it("names the missing setting, not a generic failure, when the tool has a route but nothing turned it on", () => {
    const exportConfig = {
      configured: false,
      missingDetail: "CLAUDE_CODE_ENABLE_TELEMETRY=1 and OTEL_EXPORTER_OTLP_ENDPOINT not both set, across a, b, c",
    };

    const [, , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /CLAUDE_CODE_ENABLE_TELEMETRY/);
  });

  it("cannot tell whose settings to check without a session anchor, and says so rather than guessing ok", () => {
    const [, , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig: null });

    assert.equal(claim.verdict, UNKNOWN);
    assert.match(claim.detail, /no session anchor/);
  });
});

describe("naming whether an exported record can be joined back to this session", () => {
  it("reads ok off the sink's own record, naming the attribute it actually joined on", () => {
    const exportConfig = { configured: true, identityDisabled: false };
    const exportedRecord = { vendor_id: "s-1", vendor_field: "session.id", provenance: "export" };

    const [, , , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig, exportedRecord });

    assert.equal(claim.verdict, OK);
    assert.match(claim.detail, /session\.id/);
  });

  it("never prints the literal string \"undefined\" when a matched record carries no vendor_field", () => {
    const exportConfig = { configured: true, identityDisabled: false };
    const exportedRecord = { vendor_id: "s-1", provenance: "export" };

    const [, , , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig, exportedRecord });

    assert.equal(claim.verdict, OK);
    assert.doesNotMatch(claim.detail, /undefined/);
  });

  it("names the disabling setting - the OTEL_METRICS_INCLUDE_SESSION_ID=false case - not a plain miss", () => {
    const exportConfig = {
      configured: true,
      identityDisabled: true,
      identityDisabledDetail:
        "OTEL_METRICS_INCLUDE_SESSION_ID=false in .claude/settings.local.json strips the identifier from every metric datapoint and event record it exports",
    };

    const [, , , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig, exportedRecord: undefined });

    assert.equal(claim.verdict, FAIL);
    assert.match(claim.detail, /OTEL_METRICS_INCLUDE_SESSION_ID=false/);
  });

  it("has nothing to join when no export is configured at all - not the same claim as a broken join", () => {
    const [, , , , , claim] = diagnose({
      journals: [],
      toolReads: [],
      exportConfig: { configured: false },
      exportedRecord: undefined,
    });

    assert.equal(claim.verdict, UNKNOWN);
  });

  it("has nothing to join yet when export is configured but no record has reached the sink", () => {
    const exportConfig = { configured: true, identityDisabled: false };

    const [, , , , , claim] = diagnose({ journals: [], toolReads: [], exportConfig, exportedRecord: undefined });

    assert.equal(claim.verdict, UNKNOWN);
    assert.match(claim.detail, /no exported record has reached the sink/);
  });
});

// The requirement this milestone exists for: each failure induced alone must not read as
// any of the others (five now, or six counting the unrecognised-payload split as its own
// fault). A cascading design would show two FAILs for one broken link.
describe("the eight failures, each induced alone", () => {
  const onlyFail = (claims) => claims.filter((c) => c.verdict === FAIL).map((c) => c.label);

  it("names the hook never firing, and nothing else, when no run file exists", () => {
    const claims = diagnose({ journals: [], toolReads: [], currentSessionId: "s-1" });

    assert.deepEqual(onlyFail(claims), ["hook fired"]);
  });

  it("names an unrecognised payload, and nothing else, when the marker was read - no session, session journalled and tool files readable must stay UNKNOWN, not cascade", () => {
    const claims = diagnose({
      journals: [{ session: null, boundaries: [] }],
      toolReads: [],
      currentSessionId: "s-1",
      unrecognisedPayload: { type: "unrecognised_payload", at: "2026-08-22T09:00:00Z" },
    });

    assert.deepEqual(onlyFail(claims), ["hook fired"]);
    assert.match(claims[0].detail, /matched no known host/);
    assert.equal(claims[1].verdict, UNKNOWN);
    assert.equal(claims[2].verdict, UNKNOWN);
    // The export route reads no session anchor here either (none was passed), so it must
    // stay UNKNOWN for its own reason - not cascade off the local route's failure.
    assert.equal(claims[4].verdict, UNKNOWN);
    assert.equal(claims[5].verdict, UNKNOWN);
  });

  it("names this session as having left no run file, and nothing else, while an old one reads healthy by every other measure", () => {
    const journals = [journalOf([step("2026-07-01T09:00:00Z", "a"), turnEnd("2026-07-01T09:05:00Z")], "s-old")];
    const toolReads = [toolRead({ sessionFound: true, hasIntervals: true, records: [record("journal-interval")] })];

    const claims = diagnose({ journals, toolReads, currentSessionId: "s-current" });

    assert.deepEqual(onlyFail(claims), ["hook fired"]);
  });

  it("names only session_start, and nothing else, when the run file never closed", () => {
    const claims = diagnose({
      journals: [journalOf([])],
      toolReads: [toolRead({ sessionFound: true, records: [record("unattributed")], hasIntervals: false })],
      currentSessionId: "s-1",
    });

    assert.deepEqual(onlyFail(claims), ["session journalled"]);
  });

  it("names the tool unreadable, and nothing else, when the session closed but no tool finds it", () => {
    const claims = diagnose({
      journals: [journalOf([step("2026-08-20T09:00:00Z", "a"), turnEnd("2026-08-20T09:05:00Z")])],
      toolReads: [toolRead({ sessionFound: false, records: [] })],
      currentSessionId: "s-1",
    });

    assert.deepEqual(onlyFail(claims), ["tool files readable"]);
  });

  it("names the join broken, and nothing else, when records exist beside a real interval", () => {
    const claims = diagnose({
      journals: [journalOf([step("2026-08-20T09:00:00Z", "a"), turnEnd("2026-08-20T09:05:00Z")])],
      toolReads: [toolRead({ sessionFound: true, hasIntervals: true, records: [record("unattributed")] })],
      currentSessionId: "s-1",
    });

    assert.deepEqual(onlyFail(claims), ["records join"]);
  });

  it("names the export not configured, and nothing else, when a healthy local route sits beside a route nobody turned on", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a"), turnEnd("2026-08-20T09:05:00Z")])];
    const toolReads = [toolRead({ sessionFound: true, hasIntervals: true, records: [record("journal-interval")] })];

    const claims = diagnose({
      journals,
      toolReads,
      currentSessionId: "s-1",
      exportConfig: { configured: false, missingDetail: "not configured anywhere checked" },
    });

    assert.deepEqual(onlyFail(claims), ["export configured"]);
  });

  it("names the identifier unjoinable, and nothing else, when the disabling setting is present beside an otherwise healthy install", () => {
    const journals = [journalOf([step("2026-08-20T09:00:00Z", "a"), turnEnd("2026-08-20T09:05:00Z")])];
    const toolReads = [toolRead({ sessionFound: true, hasIntervals: true, records: [record("journal-interval")] })];

    const claims = diagnose({
      journals,
      toolReads,
      currentSessionId: "s-1",
      exportConfig: {
        configured: true,
        configuredDetail: "OTLP to 127.0.0.1:4318",
        identityDisabled: true,
        identityDisabledDetail: "OTEL_METRICS_INCLUDE_SESSION_ID=false in .claude/settings.local.json strips the identifier",
      },
    });

    assert.deepEqual(onlyFail(claims), ["identifier joinable"]);
  });
});

describe("naming what nothing here can read", () => {
  it("names every uncovered tool with its own reason, and counts none of them as healthy", () => {
    const uncovered = TOOLS.filter((declaration) => !declaration.read);
    const lines = [];

    printReport((line) => lines.push(line), { claims: [], uncovered });

    assert.equal(lines.length, uncovered.length);
    for (const declaration of uncovered) {
      const line = lines.find((l) => l.includes(`not covered: ${declaration.tool}`));
      assert.ok(line, `${declaration.tool} must be named`);
      assert.ok(line.includes(declaration.reason), `${declaration.tool}'s reason must be printed`);
      // The verdict field itself, not a substring search: "ok" hides inside "token" and a
      // loose `includes` would call that a false healthy reading.
      const verdict = line.trim().split(/\s{2,}/u)[1];
      assert.equal(verdict, UNKNOWN, `${declaration.tool} must read neither ok nor FAIL`);
    }
  });
});

describe("the TOOLS declaration the checker reads is the one the cost skill reads", () => {
  // These three were shared once, under a `skills/_shared/` sibling. They cannot be: the
  // hyphen-flat install contracts rename every immediate child of `skills/` on its own, so a
  // require reaching a sibling folder resolved to a name that no longer existed and the
  // script died at load. Each skill carries its own copy, and
  // telemetry-where-things-live.test.js pins the copies byte-identical - so a tool gained or
  // lost by one skill still cannot diverge from what the other sees.
  const COST = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/01-cost/scripts");

  for (const name of ["journal.js", "readers.js", "attribution.js"]) {
    it(`${name} reads the same in the checker as in the cost skill`, () => {
      assert.equal(
        fs.readFileSync(path.join(SHARED, name), "utf8"),
        fs.readFileSync(path.join(COST, "lib", name), "utf8")
      );
    });
  }
});

// The script itself, exercising the real readers and the real journal parser end to end -
// hand-built inputs above prove the logic, this proves the wiring.
describe("the script wired to a real project", () => {
  // git exports GIT_DIR/GIT_WORK_TREE into every process it spawns, so a test run from
  // inside a git hook would otherwise point `git init` at the real repository instead of
  // this temp one - the same stripping the "no directory of any kind" test below does.
  function gitSafeEnv() {
    return Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
  }

  // The script now shells out to `git rev-parse` (see lib/repo.js), so every project this
  // suite hands it needs to actually be one, or every claim below the gate reads as
  // "not a git repository" instead of the case each test means to exercise.
  function tempProject() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-home-"));
    fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
    fs.mkdirSync(path.join(root, "aidd_docs", "runs"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: root, env: gitSafeEnv() });
    return { root, home };
  }

  // For the one test that means to exercise the absence of a repository: everything
  // tempProject() sets up, minus the `git init`.
  function tempProjectWithoutGit() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-nogit-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-nogit-home-"));
    fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
    fs.mkdirSync(path.join(root, "aidd_docs", "runs"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
    return { root, home };
  }

  function writeConfig(root, enabled) {
    fs.writeFileSync(path.join(root, ".aidd", "config.json"), JSON.stringify({ telemetry: { enabled } }));
  }

  function writeRunFile(root, name, lines) {
    const content = lines.map((line) => `${JSON.stringify(line)}\n`).join("");
    fs.writeFileSync(path.join(root, "aidd_docs", "runs", name), content);
  }

  function writeClaudeTranscript(home, sessionId, lines) {
    const dir = path.join(home, ".claude", "projects", "proj");
    fs.mkdirSync(dir, { recursive: true });
    const content = lines.map((line) => `${JSON.stringify(line)}\n`).join("");
    fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), content);
  }

  function writeCodexConfig(home, content) {
    const dir = path.join(home, ".codex");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.toml"), content);
  }

  // A minimal PATH, deliberately without whatever a developer's machine happens to have
  // installed: the opencode reader shells out when it finds the binary on PATH, and a run
  // that stumbles on a real one would turn a hermetic test into a slow, flaky one.
  //
  // CLAUDE_CODE_SESSION_ID is stripped by default too: this test file is itself run from
  // inside a live Claude Code session, so it would otherwise leak the real session id into
  // every spawn and silently make "hook fired" read `--` or worse, match a fixture by
  // accident. A test that cares passes `sessionId` explicitly.
  // `sessionId` is a plain string for the common case (Claude Code's anchor), or
  // `{ claude, codex }` when a test needs to set either or both explicitly - the nested
  // case needs both at once, one matching a fixture and one not.
  //
  // Every OTEL_* variable and CLAUDE_CODE_ENABLE_TELEMETRY are stripped by default for the
  // identical reason: a developer with telemetry actually enabled on this machine would
  // otherwise leak a real endpoint into the spawn and silently make "export configured"
  // read differently than the fixture the test built. AIDD_USER_CONFIG_DIR is stripped too -
  // left in, the sink read (export-sink.js) would escape the temp `home` this test controls
  // and read (or write) a real machine's sink instead. A test that cares passes `extraEnv`.
  function run(root, home, sessionId, extraEnv = {}) {
    const {
      AIDD_RUNS_DIR: _a,
      CLAUDE_CODE_SESSION_ID: _b,
      CODEX_THREAD_ID: _c,
      AIDD_USER_CONFIG_DIR: _d,
      ...rest
    } = process.env;
    // process.env carries the OS-cased key (often "Path" on Windows) - left in, it would
    // sit alongside PATH below as a second, unfiltered key and undo the minimal PATH the
    // next line sets.
    const env = Object.fromEntries(
      Object.entries(rest).filter(
        ([k]) => !k.startsWith("GIT_") && !k.startsWith("OTEL_") && k !== "CLAUDE_CODE_ENABLE_TELEMETRY" && !/^path$/iu.test(k),
      ),
    );
    const anchor =
      typeof sessionId === "string"
        ? { CLAUDE_CODE_SESSION_ID: sessionId }
        : {
            ...(sessionId?.claude === undefined ? {} : { CLAUDE_CODE_SESSION_ID: sessionId.claude }),
            ...(sessionId?.codex === undefined ? {} : { CODEX_THREAD_ID: sessionId.codex }),
          };
    const result = spawnSync(process.execPath, [SCRIPT], {
      cwd: root,
      encoding: "utf8",
      env: { ...env, HOME: home, PATH: GIT_DIR, ...anchor, ...extraEnv },
    });
    return result.stdout.trim().split("\n");
  }

  function writeClaudeExportSettings(root, env) {
    const dir = path.join(root, ".claude");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "settings.local.json"), JSON.stringify({ env }));
  }

  function writeExportSinkRecord(home, record, day = "2026-08-20") {
    const dir = path.join(home, ".config", "aidd", "telemetry");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, `${day}.jsonl`), `${JSON.stringify(record)}\n`);
  }

  const assistantLine = (requestId, timestamp) => ({
    type: "assistant",
    requestId,
    timestamp,
    message: { model: "claude-x", usage: { input_tokens: 10, output_tokens: 5 } },
  });

  it("stops at the switch, before checking anything, when measurement is off", () => {
    const { root, home } = tempProject();
    writeConfig(root, false);

    const lines = run(root, home);

    assert.deepEqual(lines, ["measurement is off — nothing to check until it is turned on"]);
  });

  // The defect this reproduces: resolveRunsDir (hooks/lib/record.js -> hooks/lib/repo.js)
  // gates writes on getRepoRoot, but until now nothing here checked the same thing, so a
  // hook that fired outside a repository and structurally could not write read as
  // "hook fired FAIL — never been observed firing" - a claim about the hook, not the repo.
  it("stops before evaluating any claim, and never blames the hook, when the project is not a git repository", () => {
    const { root, home } = tempProjectWithoutGit();
    writeConfig(root, true);

    const lines = run(root, home);

    assert.deepEqual(lines, [
      "not a git repository — the hook has nowhere to write here, not a hook that failed to fire",
    ]);
    assert.ok(!lines.some((line) => line.includes("never been observed firing")));
  });

  it("prints ok with the figure it rests on, for a healthy install", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FBH__s-healthy.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FBH",
        tool: "claude-code",
        vendor_id: "s-healthy",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);
    writeClaudeTranscript(home, "s-healthy", [assistantLine("req-h1", "2026-08-20T09:02:00Z")]);
    // The export route's own two claims, grown alongside the local route's four: a
    // healthy install now also has its export configured and a record the sink can join back
    // to this same session.
    writeClaudeExportSettings(root, {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
    });
    writeExportSinkRecord(home, {
      sink_schema_version: 2,
      kind: "session",
      provenance: "export",
      tool: "claude",
      vendor_id: "s-healthy",
      vendor_field: "session.id",
      step_attribution: "unattributed",
    });

    const lines = run(root, home, "s-healthy");

    assert.match(lines[0], /^\s*hook fired\s+ok/);
    assert.match(lines[1], /^\s*session journalled\s+ok/);
    assert.match(lines[2], /^\s*tool files readable\s+ok/);
    assert.match(lines[3], /^\s*records join\s+ok\s+1 of 1 record/);
    assert.match(lines[4], /^\s*export configured\s+ok\s+OTLP to http:\/\/127\.0\.0\.1:4318/);
    assert.match(lines[5], /^\s*identifier joinable\s+ok\s+session\.id/);
    assert.ok(lines.some((line) => line.includes("not covered: cursor")));
    // opencode and copilot both dropped out of "not covered": opencode once its own plugin
    // reached the journal (phase 5, see measurements.md), copilot once session.shutdown's
    // own tokenDetails was found readable - both declare journalAttributable true
    // and now carry a reader, so reachableViaJournal accepts them like claude, never
    // counting either as a miss.
    assert.ok(!lines.some((line) => line.includes("not covered: opencode")));
    assert.ok(!lines.some((line) => line.includes("not covered: copilot")));
  });

  it("names the export not configured, and the join with nothing to join, when nothing turned the export on", () => {
    // Every other line above still names a healthy install - only the export route, added
    //, is left unconfigured here to prove the pin above is not an accident of the
    // fixture always carrying both.
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FBH__s-healthy.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FBH",
        tool: "claude-code",
        vendor_id: "s-healthy",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);
    writeClaudeTranscript(home, "s-healthy", [assistantLine("req-h1", "2026-08-20T09:02:00Z")]);

    const lines = run(root, home, "s-healthy");

    assert.match(lines[4], /^\s*export configured\s+FAIL/);
    assert.match(lines[5], /^\s*identifier joinable\s+--/);
  });

  it("names the identifier unjoinable when OTEL_METRICS_INCLUDE_SESSION_ID=false sits beside an otherwise complete Claude Code export - the exact case that matters", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FBH__s-healthy.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FBH",
        tool: "claude-code",
        vendor_id: "s-healthy",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);
    writeClaudeTranscript(home, "s-healthy", [assistantLine("req-h1", "2026-08-20T09:02:00Z")]);
    writeClaudeExportSettings(root, {
      CLAUDE_CODE_ENABLE_TELEMETRY: "1",
      OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:4318",
      OTEL_METRICS_INCLUDE_SESSION_ID: "false",
    });

    const lines = run(root, home, "s-healthy");

    assert.match(lines[4], /^\s*export configured\s+ok/);
    assert.match(lines[5], /^\s*identifier joinable\s+FAIL/);
    assert.match(lines[5], /OTEL_METRICS_INCLUDE_SESSION_ID=false/);
  });

  it("reads Codex's own [otel] table when CODEX_THREAD_ID names the session, never Claude's settings files", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeCodexConfig(home, '[otel]\nmetrics_exporter = "otlp"\n');

    const lines = run(root, home, { codex: "codex-1" });

    assert.match(lines[4], /^\s*export configured\s+ok\s+otel\.metrics_exporter="otlp"/);
  });

  it("names the hook never firing when measurement is on and no run file appears", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);

    const [line] = run(root, home);

    assert.match(line, /hook fired\s+FAIL/);
    assert.match(line, /never been observed firing/);
  });

  it("names an unrecognised payload, not a hook that never ran, when only the unrecognised marker exists", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    // Written the same way handleUnrecognisedPayload does (hooks/lib/record.js): one line,
    // no session_start, at the exact path it writes to - not a reimplementation of it.
    writeRunFile(root, UNRECOGNISED_FILE_NAME, [{ type: "unrecognised_payload", at: "2026-08-20T09:00:00Z" }]);

    const lines = run(root, home);

    assert.match(lines[0], /^\s*hook fired\s+FAIL/);
    assert.match(lines[0], /matched no known host/);
    assert.match(lines[0], /2026-08-20T09:00:00Z/);
    assert.match(lines[1], /^\s*session journalled\s+--/);
    assert.match(lines[2], /^\s*tool files readable\s+--/);
    assert.match(lines[3], /^\s*records join\s+--/);
  });

  it("reads a marker missing its own shape as never having been observed, not as a claim carrying undefined", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    // A line that does not carry the marker's own shape (no `type: "unrecognised_payload"`,
    // no `at`) is not this marker, whatever wrote it - readUnrecognisedPayload must return
    // null rather than let `.at` read as undefined and print it into the claim's detail.
    writeRunFile(root, UNRECOGNISED_FILE_NAME, [{ type: "session_start" }]);

    const [line] = run(root, home);

    assert.match(line, /^\s*hook fired\s+FAIL/);
    assert.match(line, /never been observed firing/);
    assert.doesNotMatch(line, /matched no known host/);
    assert.doesNotMatch(line, /undefined/);
  });

  it("names the hook never firing, not an unrecognised payload, when the only file present is a run file torn before session_start ever parsed - no marker was read, so the specific claim must not borrow the shape", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    // Not valid JSON at all: readJournalFile's parseLine throws and the line is dropped,
    // leaving a session-less journal - the same shape the marker produces, on purpose.
    fs.writeFileSync(
      path.join(root, "aidd_docs", "runs", "01ARZ3NDEKTSV4RRFFQ69G5FTN__s-torn.jsonl"),
      '{"type":"session_start","at":"2026-08-20T09:00:00Z","run_id":"01ARZ3ND\n',
    );

    const [line] = run(root, home);

    assert.match(line, /^\s*hook fired\s+FAIL/);
    assert.match(line, /never been observed firing/);
    assert.doesNotMatch(line, /matched no known host/);
  });

  it("still reads the unrecognised-payload answer, not the never-fired one, for a real payload naming no directory of any kind - the hook falls back to its own process cwd, since an unrecognised shape cannot be assumed to spell cwd, or carry one at all", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-nocwd-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-nocwd-home-"));
    // Stripped the same way aidd-telemetry-journal.test.js does: a git hook exports
    // GIT_DIR/GIT_WORK_TREE into every child process, which would point `git init` and
    // the hook's own shellouts below at the real repository instead of this temp one.
    const gitSafeEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
    try {
      execFileSync("git", ["init", "-q"], { cwd: root, env: gitSafeEnv });
      execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root, env: gitSafeEnv });
      execFileSync("git", ["config", "user.name", "Test"], { cwd: root, env: gitSafeEnv });
      fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
      fs.mkdirSync(path.join(root, "aidd_docs", "runs"), { recursive: true });
      writeConfig(root, true);

      // The exact case reported: a payload with no cwd, no workspace_roots, nothing that
      // names a directory at all - run from inside root, as a real hook invocation would be.
      const hookScript = path.join(SCRIPTS, "../../../hooks/journal.js");
      const hookResult = spawnSync(process.execPath, [hookScript, "session-start"], {
        cwd: root,
        encoding: "utf8",
        input: JSON.stringify({ totally: "unknown", shape: 1 }),
        env: { ...gitSafeEnv, AIDD_RUNS_DIR: "" },
      });
      assert.equal(hookResult.status, 0);
      assert.equal(
        fs.existsSync(path.join(root, "aidd_docs", "runs", UNRECOGNISED_FILE_NAME)),
        true,
        "the marker must exist even though the payload named no directory of any kind",
      );

      const lines = run(root, home);

      assert.match(lines[0], /^\s*hook fired\s+FAIL/);
      assert.match(lines[0], /matched no known host/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("names only session_start, and reads the tool's own files fine beside it", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FAV__s-q2.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tool: "claude-code",
        vendor_id: "s-q2",
      },
    ]);
    writeClaudeTranscript(home, "s-q2", [assistantLine("req-1", "2026-08-20T09:10:00Z")]);

    const lines = run(root, home, "s-q2");

    assert.match(lines[1], /session journalled\s+FAIL/);
    assert.match(lines[1], /only session_start/);
    assert.match(lines[2], /tool files readable\s+ok/);
    assert.match(lines[3], /records join\s+--/);
  });

  it("names no session found for any covered tool, while the run file names one", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FDL__s-unread.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FDL",
        tool: "claude-code",
        vendor_id: "s-unread",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);

    const lines = run(root, home, "s-unread");

    assert.match(lines[2], /tool files readable\s+FAIL/);
    assert.match(lines[2], /no session found/);
    assert.match(lines[2], /s-unread/);
  });

  it("names every record unattributed, while a real step interval stood ready to receive one", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FCK__s-nojoin.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FCK",
        tool: "claude-code",
        vendor_id: "s-nojoin",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);
    // Outside the 09:00-09:05 interval, and carrying no step of its own: nothing here can
    // attribute it, even though a real interval stood ready.
    writeClaudeTranscript(home, "s-nojoin", [assistantLine("req-n1", "2026-08-20T11:00:00Z")]);

    const lines = run(root, home, "s-nojoin");

    assert.match(lines[3], /records join\s+FAIL/);
    assert.match(lines[3], /every record unattributed/);
  });

  // The failure the correction exists to catch: a project whose hook died since the last
  // run file must not read `ok` off that file forever. "s-old" is built to look completely
  // healthy by every other measure - journalled, readable, joined - so the only thing that
  // can single it out is the anchor not matching it.
  it("names this session as having left no run file, while an old one still looks healthy by every other measure", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FEM__s-old.jsonl", [
      {
        type: "session_start",
        at: "2026-07-01T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FEM",
        tool: "claude-code",
        vendor_id: "s-old",
      },
      { type: "step_start", at: "2026-07-01T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-07-01T09:05:00Z" },
    ]);
    writeClaudeTranscript(home, "s-old", [assistantLine("req-o1", "2026-07-01T09:02:00Z")]);

    const lines = run(root, home, "s-current");

    assert.match(lines[0], /hook fired\s+FAIL/);
    assert.match(lines[0], /this session left no run file/);
    assert.match(lines[0], /2026-07-01T09:00:00Z/);
    assert.match(lines[1], /session journalled\s+ok/);
    assert.match(lines[2], /tool files readable\s+ok/);
    assert.match(lines[3], /records join\s+ok/);
  });

  it("cannot tell whether this session's hook fired when no session anchor is available, and says so rather than guessing ok", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FEM__s-old.jsonl", [
      {
        type: "session_start",
        at: "2026-07-01T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FEM",
        tool: "claude-code",
        vendor_id: "s-old",
      },
      { type: "step_start", at: "2026-07-01T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-07-01T09:05:00Z" },
    ]);

    const [line] = run(root, home);

    assert.match(line, /hook fired\s+--/);
    assert.match(line, /no session anchor available/);
  });

  it("reads ok off Codex's own run file when CODEX_THREAD_ID names it", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FEC__codexthread.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FEC",
        tool: "codex",
        vendor_id: "codexthread",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);

    const [line] = run(root, home, { codex: "codexthread" });

    assert.match(line, /hook fired\s+ok/);
  });

  it("names this Codex session as having left no run file, when CODEX_THREAD_ID names a different one", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FEC__codexthread.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FEC",
        tool: "codex",
        vendor_id: "codexthread",
      },
      { type: "step_start", at: "2026-08-20T09:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ]);

    const [line] = run(root, home, { codex: "a-different-thread" });

    assert.match(line, /hook fired\s+FAIL/);
    assert.match(line, /this session left no run file/);
  });

  it("prefers Codex's own session over an inherited Claude Code one, when nested", () => {
    // The nested case, reproduced: CLAUDE_CODE_SESSION_ID matches an older, unrelated run
    // file (the enclosing session's own, inherited into this shell), while CODEX_THREAD_ID
    // - the process actually running this script - matches nothing. If the inherited
    // variable won, this would misread as ok off the parent's file; it must not.
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeRunFile(root, "01ARZ3NDEKTSV4RRFFQ69G5FED__claudeparent.jsonl", [
      {
        type: "session_start",
        at: "2026-08-20T08:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FED",
        tool: "claude-code",
        vendor_id: "claudeparent",
      },
      { type: "step_start", at: "2026-08-20T08:00:00Z", skill: "alpha" },
      { type: "turn_end", at: "2026-08-20T08:05:00Z" },
    ]);

    const [line] = run(root, home, { claude: "claudeparent", codex: "nested-codex-thread" });

    assert.match(line, /hook fired\s+FAIL/);
    assert.match(line, /this session left no run file/);
  });

  it("names an untrusted Codex hook, not a hook that never fired, when config.toml has no trusted_hash for it", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);
    writeCodexConfig(home, '[projects."/private/tmp/x"]\ntrust_level = "trusted"\n');

    const [line] = run(root, home, { codex: "codex-untrusted" });

    assert.match(line, /hook fired\s+FAIL/);
    assert.match(line, /has not trusted this plugin's hook/);
    assert.match(line, /--dangerously-bypass-hook-trust/);
    assert.doesNotMatch(line, /never been observed firing/);
  });

  it("falls back to never-fired, not a guess at trust, when Codex's own config.toml does not exist at all", () => {
    const { root, home } = tempProject();
    writeConfig(root, true);

    const [line] = run(root, home, { codex: "codex-no-config" });

    assert.match(line, /hook fired\s+FAIL/);
    assert.match(line, /never been observed firing/);
    assert.match(line, /could not be read either/);
  });
});

describe("switch.js's predicate stays identical to the hook's own", () => {
  // A fourth copy of the switch predicate, alongside journal.js/readers.js/attribution.js -
  // but not a whole-file copy of hooks/lib/repo.js, which also carries git-remote logic this
  // skill has no reason to duplicate. What must never drift, pinned as three separate
  // fragments since the two files wrap them in differently-named functions: the same config
  // path, the same strict `=== true`, and the same swallowed catch.
  const PREDICATE = "Boolean(config && config.telemetry && config.telemetry.enabled === true);";
  const CONFIG_PATH = ', ".aidd", "config.json"), "utf8")';
  const SWALLOWED_CATCH = "} catch {";

  it("carries the same predicate expression as hooks/lib/repo.js's telemetryEnabled", () => {
    const here = fs.readFileSync(path.join(SCRIPTS, "lib/switch.js"), "utf8");
    const there = fs.readFileSync(
      path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks/lib/repo.js"),
      "utf8",
    );

    for (const fragment of [PREDICATE, CONFIG_PATH, SWALLOWED_CATCH]) {
      assert.ok(here.includes(fragment), `switch.js must carry ${fragment}`);
      assert.ok(there.includes(fragment), `repo.js must carry ${fragment}`);
    }
  });
});

describe("lib/repo.js's git check stays identical to the hook's own", () => {
  // Same shape as the switch.js predicate above: a copy, not a require, of getRepoRoot's
  // command from hooks/lib/repo.js - pinned so a changed argv there cannot silently leave
  // this one answering a different question.
  const ARGV = '["rev-parse", "--show-toplevel"]';

  it("carries the same git argv as hooks/lib/repo.js's getRepoRoot", () => {
    const here = fs.readFileSync(path.join(SCRIPTS, "lib/repo.js"), "utf8");
    const there = fs.readFileSync(
      path.resolve(__dirname, "../../plugins/aidd-telemetry/hooks/lib/repo.js"),
      "utf8",
    );

    assert.ok(here.includes(ARGV), `lib/repo.js must carry ${ARGV}`);
    assert.ok(there.includes(ARGV), `hooks/lib/repo.js must carry ${ARGV}`);
  });
});

describe("lib/unrecognised.js's marker name stays identical to the hook's own", () => {
  // The fix for the critical finding: telemetry-check.js used to require
  // hooks/lib/record.js across the skill/hooks boundary for this one constant, which dies
  // at load on an install that ships skills/ without hooks/ (see the OpenCode-shaped tree
  // test below). This proves the copy that replaced it cannot drift from the value
  // hooks/lib/record.js actually writes.
  it("carries the same value as hooks/lib/record.js's own UNRECOGNISED_FILE_NAME", () => {
    const { UNRECOGNISED_FILE_NAME: here } = require(path.join(SCRIPTS, "lib/unrecognised.js"));

    assert.equal(here, UNRECOGNISED_FILE_NAME);
  });
});

describe("the uncovered fallback render.js actually prints", () => {
  // opencode was the one declaration with `limitation` and no `reason`, proving
  // `reason ?? limitation` reaches its second half against a real declaration rather than
  // only the stub below. Phase 5 (see measurements.md) made opencode's own plugin reach the
  // journal, so it dropped out of `uncovered` entirely and carries no `limitation` any more -
  // no declaration in TOOLS exercises this branch today. The stub keeps covering the code
  // path itself; a future tool that reads but declares no reason should replace it here.
  it("prints a declaration's limitation when it has no reason", () => {
    const lines = [];

    printReport((line) => lines.push(line), {
      claims: [],
      uncovered: [{ tool: "stub-tool", limitation: "stub limitation text" }],
    });

    assert.equal(lines.length, 1);
    assert.ok(lines[0].includes("stub limitation text"));
    assert.ok(!lines[0].includes("undefined"));
  });
});

describe("running from a tree that ships skills/ and no hooks/ (the OpenCode-shaped install)", () => {
  // The critical finding: telemetry-check.js used to require("../../../hooks/lib/record.js")
  // at module load, above its own try/catch. OpenCode's translator (plugin-content-
  // translator.ts's translateFlat) delivers every skills/** file, including this script,
  // and records hooks only as skipped - so that install carries skills/ with no hooks/
  // directory anywhere it could reach. Reproduced by copying the skill tree - 02-check
  // including its own scripts/lib/ copies of TOOLS, journal and attribution,
  // exactly what a real translateFlat install carries - into a temp directory; nothing is
  // deleted from the repository.
  function copyPluginTreeWithoutHooks() {
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-opencode-shaped-"));
    fs.mkdirSync(path.join(pluginRoot, "skills"), { recursive: true });
    for (const skillDir of ["02-check"]) {
      fs.cpSync(
        path.resolve(__dirname, "../../plugins/aidd-telemetry/skills", skillDir),
        path.join(pluginRoot, "skills", skillDir),
        { recursive: true, filter: (src) => !src.endsWith(".orig") },
      );
    }
    return path.join(pluginRoot, "skills", "02-check", "scripts", "telemetry-check.js");
  }

  it("prints a real report, not a Node stack trace, with no hooks/ anywhere it could reach", () => {
    const script = copyPluginTreeWithoutHooks();
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-opencode-shaped-project-"));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "aidd-check-opencode-shaped-home-"));
    const gitSafeEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("GIT_")));
    fs.mkdirSync(path.join(root, ".aidd"), { recursive: true });
    fs.mkdirSync(path.join(root, "aidd_docs", "runs"), { recursive: true });
    fs.mkdirSync(path.join(home, ".claude", "projects"), { recursive: true });
    execFileSync("git", ["init", "-q"], { cwd: root, env: gitSafeEnv });
    fs.writeFileSync(path.join(root, ".aidd", "config.json"), JSON.stringify({ telemetry: { enabled: true } }));
    const lines = [
      {
        type: "session_start",
        at: "2026-08-20T09:00:00Z",
        run_id: "01ARZ3NDEKTSV4RRFFQ69G5FSH",
        tool: "claude-code",
        vendor_id: "s-shaped",
      },
      { type: "turn_end", at: "2026-08-20T09:05:00Z" },
    ];
    fs.writeFileSync(
      path.join(root, "aidd_docs", "runs", "01ARZ3NDEKTSV4RRFFQ69G5FSH__s-shaped.jsonl"),
      lines.map((line) => `${JSON.stringify(line)}\n`).join(""),
    );

    const { AIDD_RUNS_DIR: _a, CLAUDE_CODE_SESSION_ID: _b, CODEX_THREAD_ID: _c, ...rest } = process.env;
    // See run()'s own comment above: process.env's OS-cased PATH key (often "Path" on
    // Windows) must be filtered out too, or it sits beside PATH below unfiltered.
    const env = Object.fromEntries(
      Object.entries(rest).filter(([k]) => !k.startsWith("GIT_") && !/^path$/iu.test(k)),
    );
    const result = spawnSync(process.execPath, [script], {
      cwd: root,
      encoding: "utf8",
      env: { ...env, HOME: home, PATH: GIT_DIR, CLAUDE_CODE_SESSION_ID: "s-shaped" },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND/);
    assert.doesNotMatch(result.stderr, /Cannot find module/);
    assert.match(result.stdout, /hook fired\s+ok/);
  });
});
