import type { DoctorReport } from "../../domain/doctor.js";
import type { DoctorUseCase } from "../doctor/doctor-use-case.js";
import type { GlobalExecutionError } from "./update-one-tool-use-case.js";

export interface DoctorAllResult {
  ai: DoctorReport | null;
  ide: DoctorReport | null;
  /** Plugin issues only. Plugins hang off AI tools, so the ai scope already carries them all. */
  pluginIssues: DoctorReport["pluginIssues"];
  healthy: boolean;
  errors: GlobalExecutionError[];
}

export class DoctorAllUseCase {
  constructor(private readonly doctorUseCase: DoctorUseCase) {}

  async execute(projectRoot: string, pluginName?: string): Promise<DoctorAllResult> {
    const errors: GlobalExecutionError[] = [];
    const ai = await this.runScope(
      () => this.doctorUseCase.execute({ projectRoot, category: "ai", pluginName }),
      "ai",
      errors
    );
    const ide = await this.runScope(
      () => this.doctorUseCase.execute({ projectRoot, category: "ide", pluginName }),
      "ide",
      errors
    );
    const healthy = errors.length === 0 && this.computeHealthy(ai, ide);
    return { ai, ide, pluginIssues: ai?.pluginIssues ?? [], healthy, errors };
  }

  private async runScope<T>(
    fn: () => Promise<T>,
    scope: string,
    errors: GlobalExecutionError[]
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      errors.push({ scope, message: err instanceof Error ? err.message : String(err) });
      return null;
    }
  }

  // A scope that errored is reported by `errors`, never here: a null report means "could
  // not be checked", not "checked and fine", so healthy must never read the two the same way.
  private computeHealthy(ai: DoctorReport | null, ide: DoctorReport | null): boolean {
    return (ai === null || ai.healthy) && (ide === null || ide.healthy);
  }
}
