import type { Command } from "commander";
import {
  DEFAULT_TELEMETRY_SCOPE,
  TELEMETRY_SCOPES,
  type TelemetryScope,
} from "../../domain/capabilities/telemetry-capability.js";
import { toCostReportEnvelope } from "../../domain/models/cost-report-envelope.js";
import { DEFAULT_REPORT_DAYS, resolveReportPeriod } from "../../domain/models/report-period.js";
import { createDeps } from "../../infrastructure/deps.js";
import { resolveHomeDir } from "../../infrastructure/home-dir.js";
import { ARTEFACT_AXES, buildCostReportArtefact } from "../display/cost-report-artefact.js";
import { printCostReport } from "../display/cost-report-display.js";
import {
  printLocalCostReadReport,
  printTelemetryOffReport,
  printTelemetryOnReport,
} from "../display/telemetry-display.js";
import { ErrorHandler } from "../error-handler.js";
import { InvalidTelemetryReceivePortError, InvalidTelemetryScopeError } from "../errors.js";
import { parseGlobalOptions } from "./global-options.js";

export function parseTelemetryReceivePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidTelemetryReceivePortError(raw);
  }
  return port;
}

export function parseTelemetryScope(raw: string | undefined): TelemetryScope {
  if (raw === undefined) return DEFAULT_TELEMETRY_SCOPE;
  if ((TELEMETRY_SCOPES as readonly string[]).includes(raw)) return raw as TelemetryScope;
  throw new InvalidTelemetryScopeError(raw);
}

export function registerTelemetryCommand(program: Command): void {
  const telemetry = program
    .command("telemetry")
    .description("Control whether AIDD may measure this project");

  telemetry
    .command("on")
    .description("Turn on the AIDD telemetry switch and configure installed tools")
    .option("--endpoint <url>", "OTEL export endpoint (reused from .aidd/config.json when omitted)")
    .option(
      "--scope <local|project|user>",
      "Where a tool's export config is written (default: local)"
    )
    .option("--yes", "Confirm writing the git-tracked project-scope settings file", false)
    .action(async (cmdOptions: { endpoint?: string; scope?: string; yes: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const scope = parseTelemetryScope(cmdOptions.scope);
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.telemetryOnUseCase.execute({
          projectRoot,
          homeDir: resolveHomeDir(),
          endpoint: cmdOptions.endpoint,
          scope,
          confirmProjectScope: cmdOptions.yes,
        });
        printTelemetryOnReport(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  telemetry
    .command("receive")
    .description("Listen for OTLP telemetry exports and store them under the AIDD telemetry sink")
    .option("--port <number>", "Port to listen on (default: 4318, the OTLP/HTTP default)", "4318")
    .action(async (cmdOptions: { port: string }) => {
      const { verbose, output } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const port = parseTelemetryReceivePort(cmdOptions.port);
        const deps = await createDeps(process.cwd(), { verbose }, output);
        const { rootDir } = await deps.receiveTelemetryUseCase.start();
        output.info(`AIDD telemetry sink -> ${rootDir}`);
        const { port: boundPort } = await deps.otlpHttpReceiverAdapter.listen(port);
        output.info(`Listening for OTLP telemetry on http://localhost:${boundPort}`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  telemetry
    .command("read")
    .description(
      "Read what sessions cost from the files their tools already wrote, with no process running"
    )
    .option(
      "--session <id>",
      "One session to read. Omitted, every session the run journal knows is read"
    )
    .action(async (cmdOptions: { session?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.readLocalCostUseCase.execute(
          cmdOptions.session === undefined ? {} : { sessionId: cmdOptions.session }
        );
        printLocalCostReadReport(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  telemetry
    .command("report")
    .description(
      "Report what a period, or one task inside it, cost — tokens, models and steps, with how strongly each was attributed"
    )
    .option("--from <day>", "First UTC day to report, as YYYY-MM-DD")
    .option("--to <day>", "Last UTC day to report, as YYYY-MM-DD (default today)")
    .option(
      "--days <n>",
      `How many days back to report, ending at --to (default ${DEFAULT_REPORT_DAYS})`
    )
    .option(
      "--task <identity>",
      "Restrict to the sessions that wrote into this task, as <yyyy_mm>/<name>"
    )
    .option("--project <id>", "Restrict to this project")
    .option("--step <name>", "Restrict to this step")
    .option("--model <name>", "Restrict to this model")
    .option("--tool <id>", "Restrict to this tool")
    .option(
      "--axis <axis>",
      `Print one axis as a table to paste elsewhere: ${ARTEFACT_AXES.join(" | ")}`
    )
    .option("--json", "Print one object a program can parse, instead of text for a person")
    .action(
      async (cmdOptions: {
        from?: string;
        to?: string;
        days?: string;
        task?: string;
        project?: string;
        step?: string;
        model?: string;
        tool?: string;
        axis?: string;
        json?: boolean;
      }) => {
        const { verbose, output, projectRoot } = parseGlobalOptions(program);
        const errorHandler = new ErrorHandler(output);
        try {
          // The clock is read once, here, and never again: everything downstream works from
          // the two absolute days this resolves to, so the same call answers the same twice.
          const period = resolveReportPeriod(cmdOptions, new Date());
          const deps = await createDeps(projectRoot, { verbose }, output);
          const report = await deps.reportCostUseCase.execute({
            period,
            ...(cmdOptions.task === undefined ? {} : { task: cmdOptions.task }),
            filters: {
              ...(cmdOptions.project === undefined ? {} : { project: cmdOptions.project }),
              ...(cmdOptions.step === undefined ? {} : { step: cmdOptions.step }),
              ...(cmdOptions.model === undefined ? {} : { model: cmdOptions.model }),
              ...(cmdOptions.tool === undefined ? {} : { tool: cmdOptions.tool }),
            },
          });
          // One value, three renderings. None derives a figure the others cannot see:
          // `--json` and `--axis` both read the envelope, and the terminal rendering reads
          // the report the envelope is built from.
          if (cmdOptions.json) output.print(JSON.stringify(toCostReportEnvelope(report), null, 2));
          else if (cmdOptions.axis !== undefined)
            output.print(buildCostReportArtefact(toCostReportEnvelope(report), cmdOptions.axis));
          else printCostReport(output, report);
        } catch (error) {
          errorHandler.handle(error);
        }
      }
    );

  telemetry
    .command("off")
    .description("Turn off the AIDD telemetry switch and remove what `aidd telemetry on` wrote")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.telemetryOffUseCase.execute({ projectRoot });
        printTelemetryOffReport(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
