import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Side-effect imports: the use-case resolves every AI tool's local-read declaration from
// the registry (it loops all of them, not just "claude"), so every tool must be registered
// for the local-read worked example to run at all.
import "../../../src/domain/tools/ai/claude.js";
import "../../../src/domain/tools/ai/codex.js";
import "../../../src/domain/tools/ai/copilot.js";
import "../../../src/domain/tools/ai/cursor.js";
import "../../../src/domain/tools/ai/opencode.js";
import { ReadLocalCostUseCase } from "../../../src/application/use-cases/telemetry/read-local-cost-use-case.js";
import {
  mapOtlpLogsToSinkRecords,
  mapOtlpMetricsToSinkRecords,
} from "../../../src/domain/models/telemetry-sink-record.js";
import type { LocalCostCandidateRecord } from "../../../src/domain/ports/session-cost-reader.js";
import {
  CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE,
  CLAUDE_TELEMETRY_SESSION_MEASURES,
  CLAUDE_TELEMETRY_TURN_ATTRIBUTE,
} from "../../../src/domain/tools/ai/claude-telemetry.js";
import { NULL_PERSON_IDENTITY_READER } from "../../helpers/ports/in-memory-person-identity-reader.js";
import { NULL_RUN_JOURNAL_READER } from "../../helpers/ports/in-memory-run-journal-reader.js";
import { InMemoryTelemetrySink } from "../../helpers/ports/in-memory-telemetry-sink.js";

// This test is the honesty check the contract document promises its own readers: it never
// trusts a hand-maintained list of fields on either side, only the record's own interface
// text and the document's own prose, both read fresh off disk.

const RECORD_MODEL_URL = new URL(
  "../../../src/domain/models/telemetry-sink-record.ts",
  import.meta.url
);
const CONTRACT_DOC_URL = new URL(
  "../../../../aidd_docs/product/metrics-contract.md",
  import.meta.url
);
const FIXTURES_DIR = new URL("../../fixtures/telemetry-sink/", import.meta.url);

function readTextFile(url: URL): string {
  return readFileSync(fileURLToPath(url), "utf8");
}

function loadFixture(name: string): unknown {
  return JSON.parse(readTextFile(new URL(name, FIXTURES_DIR)));
}

/** Every field name on `TelemetrySinkRecord`, read straight off the interface's own text —
 * never a hand-copied list, so an added or removed field is seen here without this file
 * being told about it. */
function recordFieldNames(): readonly string[] {
  const source = readTextFile(RECORD_MODEL_URL);
  const start = source.indexOf("export interface TelemetrySinkRecord {");
  if (start === -1) throw new Error("TelemetrySinkRecord interface not found in source");
  const end = source.indexOf("\n}", start);
  const body = source.slice(start, end);
  const fields = [...body.matchAll(/^\s*readonly\s+([a-zA-Z0-9_]+)\??:/gm)].map((m) => m[1]);
  if (fields.length === 0)
    throw new Error("no fields parsed from TelemetrySinkRecord — regex drifted");
  return fields;
}

/** Every field name the "## Field reference" section documents, one heading per field (a
 * heading may name more than one field, for the four token counters sharing one entry). */
function documentedFieldNames(): readonly string[] {
  const doc = readTextFile(CONTRACT_DOC_URL);
  const sectionStart = doc.indexOf("## Field reference");
  if (sectionStart === -1)
    throw new Error('"## Field reference" section not found in the contract doc');
  const nextSection = doc.indexOf("\n## ", sectionStart + 1);
  const section =
    nextSection === -1 ? doc.slice(sectionStart) : doc.slice(sectionStart, nextSection);
  const headings = [...section.matchAll(/^####\s+(.+)$/gm)].map((m) => m[1]);
  if (headings.length === 0) throw new Error("no #### field headings parsed from the contract doc");
  const fields = headings.flatMap((heading) =>
    [...heading.matchAll(/`([a-zA-Z0-9_]+)`/g)].map((m) => m[1])
  );
  if (fields.length === 0) throw new Error("no backticked field names parsed from #### headings");
  return fields;
}

describe("metrics contract vs. TelemetrySinkRecord", () => {
  it("documents every field the record actually has", () => {
    const recordFields = new Set(recordFieldNames());
    const documentedFields = new Set(documentedFieldNames());
    const undocumented = [...recordFields].filter((f) => !documentedFields.has(f));
    expect(
      undocumented,
      `record field(s) missing from the contract doc: ${undocumented.join(", ")}`
    ).toEqual([]);
  });

  it("never documents a field the record no longer has", () => {
    const recordFields = new Set(recordFieldNames());
    const documentedFields = new Set(documentedFieldNames());
    const stale = [...documentedFields].filter((f) => !recordFields.has(f));
    expect(stale, `documented field(s) no longer on the record: ${stale.join(", ")}`).toEqual([]);
  });
});

describe("metrics contract worked example: the two record kinds overlap", () => {
  const vendors = [
    {
      tool: "claude" as const,
      identityAttribute: CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE,
      turnAttribute: CLAUDE_TELEMETRY_TURN_ATTRIBUTE,
    },
  ];

  function docDollarFigure(rowNeedle: string): number {
    const doc = readTextFile(CONTRACT_DOC_URL);
    const rowStart = doc.indexOf(rowNeedle);
    if (rowStart === -1) throw new Error(`worked-example row not found in doc: ${rowNeedle}`);
    const lineEnd = doc.indexOf("\n", rowStart);
    const match = doc.slice(rowStart, lineEnd).match(/\*\*\$([0-9]+\.[0-9]+)\*\*/);
    if (!match) throw new Error(`no bolded dollar figure found on row: ${rowNeedle}`);
    return Number(match[1]);
  }

  it("recomputes the request-line total from the captured fixture, and it matches the doc", () => {
    const logs = loadFixture("otlp-logs-claude-code-subagent.json");
    const records = mapOtlpLogsToSinkRecords(logs, vendors);
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.kind === "request")).toBe(true);
    const total = records.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
    const documented = docDollarFigure("`otlp-logs-claude-code-subagent.json`");
    expect(Number(total.toFixed(4))).toBeCloseTo(documented, 4);
  });

  it("recomputes the session-line cost delta from the captured fixture, and it matches the doc", () => {
    const metrics = loadFixture("otlp-metrics-claude-code.json");
    const records = mapOtlpMetricsToSinkRecords(
      metrics,
      vendors,
      CLAUDE_TELEMETRY_SESSION_MEASURES
    );
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => r.kind === "session")).toBe(true);
    // "One line per datapoint, never merged" — exactly one of the six lines carries cost_usd.
    const costLines = records.filter((r) => r.cost_usd !== undefined);
    expect(costLines).toHaveLength(1);
    const documented = docDollarFigure("`otlp-metrics-claude-code.json`");
    expect(Number((costLines[0].cost_usd as number).toFixed(4))).toBeCloseTo(documented, 4);
  });

  it("documents that the metrics export uses delta aggregation temporality, and the fixture agrees", () => {
    const raw = readTextFile(new URL("otlp-metrics-claude-code.json", FIXTURES_DIR));
    expect(raw).toContain('"aggregationTemporality": 1');
    expect(readTextFile(CONTRACT_DOC_URL)).toContain("aggregationTemporality: 1");
  });
});

describe("metrics contract worked example: a re-read appends unless matched", () => {
  function docTokenFigures(): {
    readonly input: number;
    readonly output: number;
    readonly stored: number;
    readonly wouldHaveBeen: number;
  } {
    const doc = readTextFile(CONTRACT_DOC_URL);
    const setup = doc.match(/carries (\d+) input tokens and (\d+) output tokens/);
    if (!setup) throw new Error("worked-example token setup not found in doc");
    const result = doc.match(/Stored total after the second read: (\d+) tokens, not\s+(\d+)\./);
    if (!result) throw new Error("worked-example stored-total sentence not found in doc");
    return {
      input: Number(setup[1]),
      output: Number(setup[2]),
      stored: Number(result[1]),
      wouldHaveBeen: Number(result[2]),
    };
  }

  it("recomputes the matched-turn_id total via ReadLocalCostUseCase, and it matches the doc", async () => {
    const { input, output, stored } = docTokenFigures();
    const candidate: LocalCostCandidateRecord = {
      kind: "request",
      vendor_id: "s-doc-example",
      vendor_field: "sessionId",
      turn_id: "req_1",
      turn_field: "requestId",
      input_tokens: input,
      output_tokens: output,
    };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([["claude", { read: async () => ({ records: [candidate], sessionFound: true }) }]]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    await useCase.execute({ sessionId: "s-doc-example" });
    await useCase.execute({ sessionId: "s-doc-example" }); // the re-read

    const storedRecords = [...sink.files.values()].flat();
    const total = storedRecords.reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0
    );
    expect(total).toBe(stored);
  });

  it("recomputes the unmatched (no turn_id) total, and it matches the doc's counterfactual", async () => {
    const { input, output, wouldHaveBeen } = docTokenFigures();
    const candidateWithNoTurnId: LocalCostCandidateRecord = {
      kind: "request",
      vendor_id: "s-doc-example-2",
      vendor_field: "sessionId",
      input_tokens: input,
      output_tokens: output,
    };
    const sink = new InMemoryTelemetrySink();
    const useCase = new ReadLocalCostUseCase(
      sink,
      new Map([
        [
          "claude",
          { read: async () => ({ records: [candidateWithNoTurnId], sessionFound: true }) },
        ],
      ]),
      NULL_RUN_JOURNAL_READER,
      NULL_PERSON_IDENTITY_READER
    );

    await useCase.execute({ sessionId: "s-doc-example-2" });
    await useCase.execute({ sessionId: "s-doc-example-2" }); // the re-read, unmatched

    const storedRecords = [...sink.files.values()].flat();
    const total = storedRecords.reduce(
      (sum, r) => sum + (r.input_tokens ?? 0) + (r.output_tokens ?? 0),
      0
    );
    expect(total).toBe(wouldHaveBeen);
  });
});
