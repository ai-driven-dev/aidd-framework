import type { Command } from "commander";
import { toCostReportEnvelope } from "../../domain/models/cost-report-envelope.js";
import { DEFAULT_REPORT_DAYS, resolveReportPeriod } from "../../domain/models/report-period.js";
import { createDeps } from "../../infrastructure/deps.js";
import { ARTEFACT_AXES, buildCostReportArtefact } from "../display/cost-report-artefact.js";
import { printCostReport } from "../display/cost-report-display.js";
import { printTelemetryCheckReport } from "../display/telemetry-check-display.js";
import {
  printLocalCostReadReport,
  printPersonIdentityLink,
  printPersonIdentityName,
  printPersonIdentityOff,
  printPersonIdentityOn,
  printPersonIdentityStatus,
  printPersonIdentityUnlink,
  printPersonIdentityUse,
  printTelemetryOffReport,
  printTelemetryOnReport,
} from "../display/telemetry-display.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerTelemetryCommand(program: Command): void {
  const telemetry = program
    .command("telemetry")
    .description("Control whether AIDD may measure this project");

  telemetry
    .command("on")
    .description("Turn on the AIDD telemetry switch and git-ignore the run journal")
    .option(
      "--yes",
      "Confirm writing the git-tracked switch — this turns measurement on for everyone who clones",
      false
    )
    .action(async (cmdOptions: { yes: boolean }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.telemetryOnUseCase.execute({
          projectRoot,
          confirmed: cmdOptions.yes,
        });
        printTelemetryOnReport(output, result);
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
        const result = await deps.readLocalCostUseCase.execute({
          projectRoot,
          env: process.env,
          ...(cmdOptions.session === undefined ? {} : { sessionId: cmdOptions.session }),
        });
        printLocalCostReadReport(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  registerTelemetryIdentityCommand(telemetry, program);
  registerTelemetryCheckCommand(telemetry, program);

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
            projectRoot,
            env: process.env,
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
    .description(
      "Turn off the AIDD telemetry switch, warning if a tool's own settings file still exports"
    )
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

/** Whether the measurement chain is actually recording, not merely installed — a hook
 * that fired, a session that closed, a tool's own files that can be read, and the two
 * joining. Wiring only: gathers through `deps.diagnoseTelemetryUseCase`, prints through
 * `printTelemetryCheckReport`, and every failure routes through `errorHandler.handle`. */
function registerTelemetryCheckCommand(telemetry: Command, program: Command): void {
  telemetry
    .command("check")
    .description("Check whether the measurement chain is actually recording for this project")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await deps.diagnoseTelemetryUseCase.execute({
          projectRoot,
          env: process.env,
        });
        printTelemetryCheckReport(output, result);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}

/** Whether this person's own identifier is attached to what `aidd telemetry read` stores —
 * never a project's choice, and never the `telemetry on`/`off` switch beside it. Wiring
 * only: every verb reads through `deps.personIdentityUseCase`, and every failure routes
 * through `errorHandler.handle`. */
function registerTelemetryIdentityCommand(telemetry: Command, program: Command): void {
  const identity = telemetry
    .command("identity")
    .description("Whether this person's own identifier is attached to records read locally");
  identity.action(() => identity.help());

  identity
    .command("status")
    .description("Show whether this person opted in, and with what identifier")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityStatus(output, await deps.personIdentityUseCase.status());
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("on")
    .description("Opt in: mint this person's own identifier, once")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityOn(output, await deps.personIdentityUseCase.on());
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("use <identifier>")
    .description("Take an identifier minted on another machine, so this person reads as one")
    .action(async (identifier: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityUse(output, await deps.personIdentityUseCase.use(identifier));
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("off")
    .description("Opt out: new records carry no person, from now on")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityOff(output, await deps.personIdentityUseCase.off());
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("name <value>")
    .description("Attach a display name to the identifier already opted into")
    .action(async (value: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityName(output, await deps.personIdentityUseCase.name(value));
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("link <identity>")
    .description(
      "Add an identifier this person cannot choose onto this same person - one row, not two, in a report"
    )
    .action(async (rawIdentity: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityLink(output, await deps.personIdentityUseCase.link(rawIdentity));
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  identity
    .command("unlink <identity>")
    .description("Withdraw an added identifier from this person")
    .action(async (rawIdentity: string) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);
      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        printPersonIdentityUnlink(output, await deps.personIdentityUseCase.unlink(rawIdentity));
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
