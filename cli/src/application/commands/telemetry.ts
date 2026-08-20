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
