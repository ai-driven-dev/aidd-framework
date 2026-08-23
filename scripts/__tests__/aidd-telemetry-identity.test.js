const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { describe, it, after } = require("node:test");

const SHARED = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills/_shared");
const SCRIPTS = path.resolve(__dirname, "../../plugins/aidd-telemetry/skills");
const IDENTITY_SCRIPT = path.join(SCRIPTS, "00-init/scripts/telemetry-identity.js");
const REPORT_SCRIPT = path.join(SCRIPTS, "01-cost/scripts/telemetry-report.js");
const FIXTURES = path.resolve(__dirname, "../../cli/tests/fixtures/local-cost");

const CLAUDE_SESSION = "22222222-2222-4222-8222-222222222222";
const CODEX_SESSION = "019fae6f-2009-7cd3-86b2-b8f83481b160";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** Re-required per call so it reads whichever sentinel HOME/APPDATA was just set, the same
 * pattern telemetry-where-things-live.test.js uses for sink.js. */
function identityModule() {
  delete require.cache[require.resolve(path.join(SHARED, "identity.js"))];
  return require(path.join(SHARED, "identity.js"));
}

describe("who a default installation names: nobody", () => {
  it("reads no identity when nothing was ever written", () => {
    const home = tempDir("aidd-identity-home-");
    process.env.HOME = home;
    delete process.env.AIDD_USER_CONFIG_DIR;
    assert.equal(identityModule().readIdentity(), null);
  });

  it("a repository or a CI variable cannot supply one: only the real HOME can", () => {
    const home = tempDir("aidd-identity-home-");
    const elsewhere = tempDir("aidd-identity-elsewhere-");
    fs.mkdirSync(path.join(elsewhere, "telemetry"), { recursive: true });
    fs.writeFileSync(
      path.join(elsewhere, "identity.json"),
      JSON.stringify({ person_id: "planted-by-a-shared-dir" })
    );
    process.env.HOME = home;
    process.env.AIDD_USER_CONFIG_DIR = elsewhere;
    assert.equal(identityModule().readIdentity(), null);
    delete process.env.AIDD_USER_CONFIG_DIR;
  });
});

// `process.platform` is read inside identityDir() on every call, so stating it here is
// enough - no re-require needed. Pinned on any platform rather than only on a Windows
// runner: where a person's file lands is a pure resolution, and a test only a runner we
// rarely have can fail is a test that lets this regress silently (#707).
function withPlatform(platform, run) {
  const original = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    run();
  } finally {
    Object.defineProperty(process, "platform", original);
  }
}

describe("where a person's own file lands", () => {
  it("Windows keeps it under %APPDATA%, not under .config", () => {
    const appData = tempDir("aidd-identity-appdata-");
    const home = tempDir("aidd-identity-home-");
    const previousAppData = process.env.APPDATA;
    process.env.HOME = home;
    process.env.APPDATA = appData;
    withPlatform("win32", () => {
      assert.equal(
        identityModule().identityFilePath(),
        path.join(appData, "aidd", "identity.json")
      );
    });
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
  });

  it("a POSIX machine keeps it under the OS user's own .config", () => {
    const home = tempDir("aidd-identity-home-");
    process.env.HOME = home;
    withPlatform("linux", () => {
      assert.equal(
        identityModule().identityFilePath(),
        path.join(home, ".config", "aidd", "identity.json")
      );
    });
  });

  it("the shared-location variable stays ignored on both", () => {
    const home = tempDir("aidd-identity-home-");
    const elsewhere = tempDir("aidd-identity-elsewhere-");
    const appData = tempDir("aidd-identity-appdata-");
    const previousAppData = process.env.APPDATA;
    process.env.HOME = home;
    process.env.APPDATA = appData;
    process.env.AIDD_USER_CONFIG_DIR = elsewhere;
    for (const platform of ["win32", "linux"]) {
      withPlatform(platform, () => {
        assert.ok(
          !identityModule().identityFilePath().startsWith(elsewhere),
          `AIDD_USER_CONFIG_DIR must not relocate a person's own choice on ${platform}`
        );
      });
    }
    delete process.env.AIDD_USER_CONFIG_DIR;
    if (previousAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = previousAppData;
  });
});

describe("the identifier itself", () => {
  it("is random, not derived from anything that identifies the person elsewhere", () => {
    const { generatePersonId } = identityModule();
    const first = generatePersonId();
    const second = generatePersonId();
    assert.match(first, UUID_V4);
    assert.notEqual(first, second, "regenerating must not answer the same value twice");
  });
});

// The identity file's own rule, restated rather than imported: a test that asked the code
// where it put the file could never catch the code putting it in the wrong place. Windows
// keeps a person's data under %APPDATA%, so the sandbox supplies one inside the temp home
// - without it these would read, and write, the runner's real profile (#707).
function appDataIn(home) {
  return path.join(home, "AppData", "Roaming");
}

function identityFileIn(home) {
  return process.platform === "win32"
    ? path.join(appDataIn(home), "aidd", "identity.json")
    : path.join(home, ".config", "aidd", "identity.json");
}

function identityEnv(home) {
  const { GIT_DIR: _g, GIT_INDEX_FILE: _i, GIT_WORK_TREE: _w, ...rest } = process.env;
  return { ...rest, HOME: home, APPDATA: appDataIn(home) };
}

function runIdentity(home, args) {
  return spawnSync(process.execPath, [IDENTITY_SCRIPT, ...args], {
    encoding: "utf8",
    env: identityEnv(home),
  });
}

describe("choosing, and taking it back", () => {
  it("opting in is one action, and says what it attaches to and what it does not", () => {
    const home = tempDir("aidd-identity-home-");
    const result = runIdentity(home, ["on"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Attaches to:/u);
    assert.match(result.stdout, /Never attaches to:/u);
    const stored = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    );
    assert.match(stored.person_id, UUID_V4);
    assert.ok(!("display_name" in stored), "opting in alone must not set a display name");
  });

  it("opting in twice keeps the same identifier", () => {
    const home = tempDir("aidd-identity-home-");
    runIdentity(home, ["on"]);
    const first = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    ).person_id;
    runIdentity(home, ["on"]);
    const second = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    ).person_id;
    assert.equal(second, first);
  });

  it("the identifier and the display name are separate: one exists without the other", () => {
    const home = tempDir("aidd-identity-home-");
    runIdentity(home, ["on"]);
    runIdentity(home, ["name", "Baptiste"]);
    const stored = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    );
    assert.match(stored.person_id, UUID_V4);
    assert.equal(stored.display_name, "Baptiste");
  });

  it("a display name cannot be set before opting in, and nothing is written", () => {
    const home = tempDir("aidd-identity-home-");
    const result = runIdentity(home, ["name", "Baptiste"]);

    assert.equal(result.status, 1);
    assert.ok(!fs.existsSync(identityFileIn(home)));
  });

  it("withdrawing is one action, stops new records, and says what stays", () => {
    const home = tempDir("aidd-identity-home-");
    runIdentity(home, ["on"]);
    const filePath = identityFileIn(home);
    assert.ok(fs.existsSync(filePath));

    const result = runIdentity(home, ["off"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /already stored keep the identifier/u);
    assert.ok(!fs.existsSync(filePath), "the file itself is removed, never rewritten");
  });

  it("withdrawing with nothing set is a no-op, not an error", () => {
    const home = tempDir("aidd-identity-home-");
    const result = runIdentity(home, ["off"]);

    assert.equal(result.status, 0, result.stderr);
    assert.ok(!fs.existsSync(identityFileIn(home)));
  });

  it("opting in again after withdrawing mints a fresh identifier, never the old one", () => {
    const home = tempDir("aidd-identity-home-");
    runIdentity(home, ["on"]);
    const before = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    ).person_id;
    runIdentity(home, ["off"]);
    runIdentity(home, ["on"]);
    const after = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    ).person_id;
    assert.notEqual(after, before);
  });
});

// A checkout-level setting must not be able to make this choice: `.aidd/config.json`
// belongs to the repository, not the person, and the identity script never even opens it.
describe("the choice belongs to the person, not the repository", () => {
  it("a project's own .aidd/config.json cannot supply or force an identity", () => {
    const home = tempDir("aidd-identity-home-");
    const repo = tempDir("aidd-identity-repo-");
    fs.mkdirSync(path.join(repo, ".aidd"), { recursive: true });
    fs.writeFileSync(
      path.join(repo, ".aidd", "config.json"),
      JSON.stringify({ telemetry: { enabled: true, person_id: "forced-by-the-repo" } })
    );

    const result = spawnSync(process.execPath, [IDENTITY_SCRIPT, "status"], {
      cwd: repo,
      encoding: "utf8",
      env: identityEnv(home),
    });

    assert.match(result.stdout, /off - records carry no person/u);
  });
});

// --- Stamping what actually gets stored, end to end -----------------------------------

function reportEnv(home, configDir) {
  const { GIT_DIR: _g, GIT_INDEX_FILE: _i, GIT_WORK_TREE: _w, ...rest } = process.env;
  return { ...rest, HOME: home, AIDD_USER_CONFIG_DIR: configDir };
}

function seedJournal(projectDir, runId, vendorId, tool, sessionStartAt, turnEndAt) {
  const runs = path.join(projectDir, "aidd_docs", "runs");
  fs.mkdirSync(runs, { recursive: true });
  const line = (value) => `${JSON.stringify(value)}\n`;
  fs.writeFileSync(
    path.join(runs, `${runId}__${vendorId}.jsonl`),
    line({
      type: "session_start",
      at: sessionStartAt,
      run_id: runId,
      tool,
      vendor_id: vendorId,
      project_id: "acme-widgets",
    }) + line({ type: "turn_end", at: turnEndAt })
  );
}

function runRead(projectDir, home, configDir) {
  return spawnSync(process.execPath, [REPORT_SCRIPT, "read"], {
    cwd: projectDir,
    encoding: "utf8",
    env: reportEnv(home, configDir),
  });
}

function storedLines(configDir) {
  const dir = path.join(configDir, "telemetry");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .sort()
    .flatMap((name) =>
      fs
        .readFileSync(path.join(dir, name), "utf8")
        .split("\n")
        .filter((raw) => raw.trim() !== "")
        .map((raw) => JSON.parse(raw))
    );
}

describe("what a default install actually stores: reading every line it wrote", () => {
  it("carries no person field anywhere, proven from the stored bytes", () => {
    const home = tempDir("aidd-identity-e2e-home-");
    fs.cpSync(FIXTURES, home, { recursive: true });
    const projectDir = tempDir("aidd-identity-e2e-project-");
    const configDir = tempDir("aidd-identity-e2e-sink-");
    seedJournal(
      projectDir,
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      CLAUDE_SESSION,
      "claude-code",
      "2026-08-05T19:00:00Z",
      "2026-08-05T20:00:00Z"
    );

    const result = runRead(projectDir, home, configDir);
    assert.equal(result.status, 0, result.stderr);

    const lines = storedLines(configDir);
    assert.ok(lines.length > 0, "the fixture must have produced stored records");
    for (const line of lines) {
      assert.ok(!("person_id" in line), "no default record may carry person_id");
      assert.ok(!("person_display_name" in line), "no default record may carry person_display_name");
    }
  });
});

describe("a choice made today does not reach backwards", () => {
  it("records stored before opting in stay unnamed; only later records carry it", () => {
    const home = tempDir("aidd-identity-e2e-home-");
    fs.cpSync(FIXTURES, home, { recursive: true });
    const projectDir = tempDir("aidd-identity-e2e-project-");
    const configDir = tempDir("aidd-identity-e2e-sink-");
    seedJournal(
      projectDir,
      "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      CLAUDE_SESSION,
      "claude-code",
      "2026-08-05T19:00:00Z",
      "2026-08-05T20:00:00Z"
    );

    // First read, anonymous: this is what "before opting in" means.
    runRead(projectDir, home, configDir);
    const beforeOptIn = storedLines(configDir);
    assert.ok(beforeOptIn.length > 0);
    assert.ok(beforeOptIn.every((line) => !("person_id" in line)));

    runIdentity(home, ["on"]);
    const personId = JSON.parse(
      fs.readFileSync(identityFileIn(home), "utf8")
    ).person_id;

    // A second journalled session, read for the first time only now that this person has
    // opted in - the direct proof that new records carry it.
    seedJournal(
      projectDir,
      "01ARZ3NDEKTSV4RRFFQ69G5FBW",
      CODEX_SESSION,
      "codex",
      "2026-07-29T15:10:00Z",
      "2026-07-29T15:30:00Z"
    );
    runRead(projectDir, home, configDir);
    const afterOptIn = storedLines(configDir);

    const claudeLines = afterOptIn.filter((line) => line.vendor_id === CLAUDE_SESSION);
    const codexLines = afterOptIn.filter((line) => line.vendor_id === CODEX_SESSION);
    assert.ok(claudeLines.length > 0);
    assert.ok(codexLines.length > 0);
    assert.ok(
      claudeLines.every((line) => !("person_id" in line)),
      "a session read before the opt-in must stay anonymous even after a later read"
    );
    assert.ok(
      codexLines.every((line) => line.person_id === personId),
      "a session read after the opt-in must carry the identifier"
    );
  });
});
