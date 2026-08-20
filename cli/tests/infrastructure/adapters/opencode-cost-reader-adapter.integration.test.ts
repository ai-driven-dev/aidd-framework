import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { OpencodeExportError } from "../../../src/domain/errors.js";
import { OpencodeCostReaderAdapter } from "../../../src/infrastructure/adapters/opencode-cost-reader-adapter.js";

const SESSION_ID = "ses_test_read";
const FIXTURE_PATH = fileURLToPath(
  new URL("../../fixtures/telemetry-sink/opencode-export.json", import.meta.url)
);

/** Installs a real, executable `opencode` stand-in on an isolated PATH — no mock of
 * `child_process`, so absent/failing/slow/well-behaved all exercise the real spawn and
 * real timeout machinery a mock would paper over. */
function installStandIn(scriptBody: string): { restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "aidd-opencode-bin-"));
  writeFileSync(join(dir, "opencode"), scriptBody, { mode: 0o755 });
  const prevPath = process.env.PATH;
  process.env.PATH = dir;
  return {
    restore: () => {
      process.env.PATH = prevPath;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function emptyPath(): { restore: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "aidd-opencode-empty-"));
  const prevPath = process.env.PATH;
  process.env.PATH = dir;
  return {
    restore: () => {
      process.env.PATH = prevPath;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// The isolated PATH used to install this stand-in holds nothing else, so every command the
// script calls — including `cat` and `sleep` below — needs its full, non-PATH-dependent path.
const WELL_BEHAVED_SCRIPT = `#!/bin/sh
if [ "$1" = "export" ] && [ "$3" = "--sanitize" ]; then
  /bin/cat "${FIXTURE_PATH}"
  exit 0
fi
exit 1
`;

const UNKNOWN_SESSION_SCRIPT = `#!/bin/sh
echo "Exporting session: $2" 1>&2
echo "Error: Session not found: $2" 1>&2
exit 1
`;

const GENERIC_FAILURE_SCRIPT = `#!/bin/sh
echo "internal error: storage unavailable" 1>&2
exit 2
`;

const SLOW_SCRIPT = `#!/bin/sh
/bin/sleep 3
echo "{}"
exit 0
`;

describe("OpencodeCostReaderAdapter", () => {
  let restorePath: (() => void) | undefined;

  afterEach(() => {
    restorePath?.();
    restorePath = undefined;
  });

  it("returns nothing when the opencode binary is not on PATH", async () => {
    const env = emptyPath();
    restorePath = env.restore;

    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).resolves.toEqual([]);
  });

  it("reads a well-behaved export into one record per counted message", async () => {
    const env = installStandIn(WELL_BEHAVED_SCRIPT);
    restorePath = env.restore;

    const records = await new OpencodeCostReaderAdapter().read(SESSION_ID);

    expect(records).toHaveLength(4);
    expect(records[0]).toMatchObject({
      kind: "request",
      vendor_id: SESSION_ID,
      vendor_field: "sessionID",
      model: "claude-sonnet-4-6",
      input_tokens: 3,
      output_tokens: 115,
      cache_read_tokens: 43639,
      cache_creation_tokens: 3141,
    });
    expect(records.every((r) => typeof r.turn_id === "string" && r.turn_id.length > 0)).toBe(true);
  });

  it("returns nothing, not an error, for an unknown session", async () => {
    const env = installStandIn(UNKNOWN_SESSION_SCRIPT);
    restorePath = env.restore;

    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).resolves.toEqual([]);
  });

  it("throws OpencodeExportError, and stores nothing, on a non-zero exit unrelated to an unknown session", async () => {
    const env = installStandIn(GENERIC_FAILURE_SCRIPT);
    restorePath = env.restore;

    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
      OpencodeExportError
    );
    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
      "storage unavailable"
    );
  });

  it("throws OpencodeExportError, and stores nothing, when the command exceeds its timeout", async () => {
    const env = installStandIn(SLOW_SCRIPT);
    restorePath = env.restore;

    await expect(new OpencodeCostReaderAdapter(200).read(SESSION_ID)).rejects.toThrow(
      OpencodeExportError
    );
  });

  it("throws OpencodeExportError when the command answers with something that is not JSON", async () => {
    const env = installStandIn('#!/bin/sh\necho "not json"\nexit 0\n');
    restorePath = env.restore;

    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
      OpencodeExportError
    );
  });
});
