import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Scans tests/fixtures/local-cost/ itself, not a named list of files — a fixture added
// later by this test's own module or by a future tool reader is covered automatically.
const FIXTURES_DIR = fileURLToPath(new URL("../../../../fixtures/local-cost", import.meta.url));

// Keys no counter-bearing line ever needs: each carried a real prompt, file path,
// credential-adjacent detail or system-prompt-sized blob in the transcripts excerpted here.
const FORBIDDEN_KEYS = [
  "cwd",
  "workspace_roots",
  "gitBranch",
  "developer_instructions",
  "signature",
  "rate_limits",
  "base_instructions",
  "git",
  "version",
];

const MAX_STRING_LENGTH = 200;
const REDACTED_PLACEHOLDER = "[REDACTED]";
const ABSOLUTE_PATH_RE = /^\/(Users|private|home)\//;
const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function listFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) files.push(...listFiles(full));
    else files.push(full);
  }
  return files;
}

function walkValues(
  value: unknown,
  onString: (s: string) => void,
  onKey: (k: string) => void
): void {
  if (typeof value === "string") {
    onString(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkValues(item, onString, onKey);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      onKey(key);
      walkValues(item, onString, onKey);
    }
  }
}

describe("tests/fixtures/local-cost — no fixture carries prompt, response, or file content", () => {
  const files = listFiles(FIXTURES_DIR);

  it("finds at least the four known fixtures — the scan itself is not vacuous", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it.each(files.map((f) => [f.replace(`${FIXTURES_DIR}/`, ""), f] as const))(
    "%s carries no forbidden key, absolute path, email, or oversized string",
    (_label, file) => {
      const lines = readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim());
      for (const line of lines) {
        const parsed: unknown = JSON.parse(line);
        walkValues(
          parsed,
          (s) => {
            expect(s).not.toMatch(ABSOLUTE_PATH_RE);
            expect(s).not.toMatch(EMAIL_RE);
            if (s.length > MAX_STRING_LENGTH) expect(s).toBe(REDACTED_PLACEHOLDER);
          },
          (k) => {
            expect(FORBIDDEN_KEYS, `${file} carries forbidden key "${k}"`).not.toContain(k);
          }
        );
      }
    }
  );
});
