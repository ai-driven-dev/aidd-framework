import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { OpencodeCostReaderAdapter } from "../../../../src/contexts/telemetry/infrastructure/opencode-cost-reader-adapter.js";
import { OpencodeExportError } from "../../../../src/kernel/errors.js";

const SESSION_ID = "ses_test_read";
const FIXTURE_PATH = fileURLToPath(
  new URL("../../../fixtures/telemetry-sink/opencode-export.json", import.meta.url)
);

/** Installs a real, executable `opencode` stand-in on an isolated PATH — no mock of
 * `child_process`, so the real spawn and timeout machinery is exercised. */
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

    // No binary on the path is no trace of the session, never a session that cost nothing.
    await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).resolves.toEqual({
      records: [],
      sessionFound: false,
    });
  });

  // The stand-in is a `#!/bin/sh` file with no extension: Windows resolves an executable by
  // PATHEXT, not a shebang or the POSIX execute bit, so it never launches there.
  const skipOnWindows = process.platform === "win32";

  it.skipIf(skipOnWindows)(
    "reads a well-behaved export into one record per billed message",
    async () => {
      const env = installStandIn(WELL_BEHAVED_SCRIPT);
      restorePath = env.restore;

      const { records, sessionFound } = await new OpencodeCostReaderAdapter().read(SESSION_ID);

      expect(sessionFound).toBe(true);
      // The fixture's fourth assistant message carries no `total` — never billed — so it
      // yields no record.
      expect(records).toHaveLength(3);
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
      expect(records.every((r) => typeof r.turn_id === "string" && r.turn_id.length > 0)).toBe(
        true
      );
    }
  );

  it.skipIf(skipOnWindows)(
    "says it found no session, not an error, for an unknown session",
    async () => {
      const env = installStandIn(UNKNOWN_SESSION_SCRIPT);
      restorePath = env.restore;

      await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).resolves.toEqual({
        records: [],
        sessionFound: false,
      });
    }
  );

  it.skipIf(skipOnWindows)(
    "throws OpencodeExportError, and stores nothing, on a non-zero exit unrelated to an unknown session",
    async () => {
      const env = installStandIn(GENERIC_FAILURE_SCRIPT);
      restorePath = env.restore;

      await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
        OpencodeExportError
      );
      await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
        "storage unavailable"
      );
    }
  );

  it.skipIf(skipOnWindows)(
    "throws OpencodeExportError, and stores nothing, when the command exceeds its timeout",
    async () => {
      const env = installStandIn(SLOW_SCRIPT);
      restorePath = env.restore;

      await expect(new OpencodeCostReaderAdapter(200).read(SESSION_ID)).rejects.toThrow(
        OpencodeExportError
      );
    }
  );

  it.skipIf(skipOnWindows)(
    "throws OpencodeExportError when the command answers with something that is not JSON",
    async () => {
      const env = installStandIn('#!/bin/sh\necho "not json"\nexit 0\n');
      restorePath = env.restore;

      await expect(new OpencodeCostReaderAdapter().read(SESSION_ID)).rejects.toThrow(
        OpencodeExportError
      );
    }
  );
});
