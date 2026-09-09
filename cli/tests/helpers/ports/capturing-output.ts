import { CLIOutput } from "../../../src/presentation/output.js";

export type OutputLevel = "debug" | "info" | "warn" | "print" | "success" | "error";

export interface CapturedLine {
  readonly level: OutputLevel;
  readonly message: string;
}

/** Extends the real output rather than standing in for it, so a widened double cannot stop
 * failing the day the class grows a method a display starts calling. */
export class CapturingOutput extends CLIOutput {
  readonly captured: CapturedLine[] = [];

  /** Every message, in order, whatever its level. */
  get lines(): string[] {
    return this.captured.map((line) => line.message);
  }

  at(level: OutputLevel): string[] {
    return this.captured.filter((line) => line.level === level).map((line) => line.message);
  }

  override debug(message: string): void {
    this.captured.push({ level: "debug", message });
  }
  override info(message: string): void {
    this.captured.push({ level: "info", message });
  }
  override warn(message: string): void {
    this.captured.push({ level: "warn", message });
  }
  override print(message: string): void {
    this.captured.push({ level: "print", message });
  }
  override success(message: string): void {
    this.captured.push({ level: "success", message });
  }
  override error(message: string): void {
    this.captured.push({ level: "error", message });
  }
}
