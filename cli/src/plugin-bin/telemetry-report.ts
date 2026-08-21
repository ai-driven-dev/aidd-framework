#!/usr/bin/env node
import { homedir } from "node:os";
import "../domain/tools/ai/claude.js";
import "../domain/tools/ai/codex.js";
import "../domain/tools/ai/copilot.js";
import "../domain/tools/ai/cursor.js";
import "../domain/tools/ai/opencode.js";
import { printCostReport } from "../application/display/cost-report-display.js";
import { printLocalCostReadReport } from "../application/display/telemetry-display.js";
import { CLIOutput } from "../application/output.js";
import { ReadLocalCostUseCase } from "../application/use-cases/telemetry/read-local-cost-use-case.js";
import { ReportCostUseCase } from "../application/use-cases/telemetry/report-cost-use-case.js";
import {
  CLAUDE_CODE_TRANSCRIPT_LOCATION,
  createClaudeCodeTranscriptAccumulator,
} from "../domain/formats/claude-code-transcript.js";
import {
  CODEX_ROLLOUT_LOCATION,
  createCodexRolloutAccumulator,
} from "../domain/formats/codex-rollout.js";
import { toCostReportEnvelope } from "../domain/models/cost-report-envelope.js";
import { type ReportPeriodRequest, resolveReportPeriod } from "../domain/models/report-period.js";
import type { AiToolId } from "../domain/models/tool-ids.js";
import type { SessionCostReader } from "../domain/ports/session-cost-reader.js";
import { OpencodeCostReaderAdapter } from "../infrastructure/adapters/opencode-cost-reader-adapter.js";
import { RunJournalReaderAdapter } from "../infrastructure/adapters/run-journal-reader-adapter.js";
import { TelemetrySinkAdapter } from "../infrastructure/adapters/telemetry-sink-adapter.js";
import { TranscriptCostReaderAdapter } from "../infrastructure/adapters/transcript-cost-reader-adapter.js";

/**
 * What sessions consumed, read from the files their tools already wrote.
 *
 * Ships inside the **cost** skill, which owns answering that question. Allowing
 * measurement at all is a different responsibility, in a different skill, with its own
 * script — so neither ever opens a file belonging to the other.
 *
 * Every dependency is inlined at build time, so installing the plugin is the whole
 * installation. Argv is read by hand: two subcommands and six flags do not justify
 * carrying a parser, a prompt library and a renderer in a file the plugin ships. Nothing
 * below this line decides anything — the rules all live in `domain/`, and the `aidd` CLI
 * wires the very same classes, which is what keeps the two answers identical rather than
 * merely similar.
 */
const USAGE = [
  "Usage:",
  "  telemetry-report read [--session <id>]",
  "  telemetry-report report [--from <day>] [--to <day>] [--days <n>] [--task <id>] [--json]",
].join("\n");

function flagOf(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at === -1 ? undefined : argv[at + 1];
}

/** Built field by field rather than through a helper: a helper general enough to add any
 * key would have to assert its own return type, and an assertion is what stops holding
 * when a shape moves. */
function periodRequest(argv: readonly string[]): ReportPeriodRequest {
  const from = flagOf(argv, "--from");
  const to = flagOf(argv, "--to");
  const days = flagOf(argv, "--days");
  return {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
    ...(days === undefined ? {} : { days }),
  };
}

/** The one place a tool that declares a local read is mapped to the adapter that reads it,
 * mirroring the CLI's own composition root. A sixth tool is a line here and a declaration
 * in `domain/tools/ai/`; nothing between the two knows a tool by name. */
function localCostReaders(): ReadonlyMap<AiToolId, SessionCostReader> {
  return new Map<AiToolId, SessionCostReader>([
    ["opencode", new OpencodeCostReaderAdapter()],
    [
      "claude",
      new TranscriptCostReaderAdapter(
        homedir(),
        CLAUDE_CODE_TRANSCRIPT_LOCATION,
        createClaudeCodeTranscriptAccumulator
      ),
    ],
    [
      "codex",
      new TranscriptCostReaderAdapter(
        homedir(),
        CODEX_ROLLOUT_LOCATION,
        createCodexRolloutAccumulator
      ),
    ],
  ]);
}

async function runRead(argv: readonly string[], output: CLIOutput, root: string): Promise<void> {
  const session = flagOf(argv, "--session");
  const useCase = new ReadLocalCostUseCase(
    new TelemetrySinkAdapter(),
    localCostReaders(),
    new RunJournalReaderAdapter(root)
  );
  printLocalCostReadReport(
    output,
    await useCase.execute(session === undefined ? {} : { sessionId: session })
  );
}

async function runReport(argv: readonly string[], output: CLIOutput, root: string): Promise<void> {
  // The clock is read once, here: everything downstream works from the two absolute days
  // this resolves to, so the same call answers the same twice.
  const period = resolveReportPeriod(periodRequest(argv), new Date());
  const task = flagOf(argv, "--task");
  const report = await new ReportCostUseCase(
    new TelemetrySinkAdapter(),
    new RunJournalReaderAdapter(root)
  ).execute({ period, ...(task === undefined ? {} : { task }) });
  // One value, two renderings. Neither derives a figure the other cannot see.
  if (argv.includes("--json")) output.print(JSON.stringify(toCostReportEnvelope(report), null, 2));
  else printCostReport(output, report);
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const output = new CLIOutput(false);
  const root = process.cwd();

  if (argv[0] === "read") {
    await runRead(argv, output, root);
    return 0;
  }
  if (argv[0] === "report") {
    await runReport(argv, output, root);
    return 0;
  }
  output.error(USAGE);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
