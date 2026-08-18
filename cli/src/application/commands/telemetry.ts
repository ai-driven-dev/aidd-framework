import { homedir } from "node:os";
import type { Command } from "commander";
import {
  DEFAULT_TELEMETRY_SCOPE,
  TELEMETRY_SCOPES,
  type TelemetryScope,
} from "../../domain/capabilities/telemetry-capability.js";
import { createDeps } from "../../infrastructure/deps.js";
import { printTelemetryOffReport, printTelemetryOnReport } from "../display/telemetry-display.js";
import { ErrorHandler } from "../error-handler.js";
import { InvalidTelemetryScopeError } from "../errors.js";
import { parseGlobalOptions } from "./global-options.js";

/** Extracted for direct testing: the only judgement `telemetry on`'s handler makes is
 * validating the `--scope` flag's shape before anything is built — everything else lives
 * in TelemetryOnUseCase. */
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
          homeDir: homedir(),
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
