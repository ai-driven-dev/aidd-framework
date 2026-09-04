import type { StatusQuery, StatusReport, StatusUseCase } from "../status-use-case.js";
import type { GlobalExecutionError } from "./update-one-tool-use-case.js";
export interface StatusAllResult {
  aiTools: StatusReport;
  ideTools: StatusReport;
  /** Plugin drift only. Plugins hang off AI tools, so the ai scope already carries them all. */
  pluginDrift: StatusReport["pluginDrift"];
  errors: GlobalExecutionError[];
}

export class StatusAllUseCase {
  constructor(private readonly statusUseCase: StatusQuery) {}

  async execute(projectRoot: string): Promise<StatusAllResult> {
    const errors: GlobalExecutionError[] = [];
    const [aiTools, ideTools] = await this.collectCategoryReports(
      this.statusUseCase,
      projectRoot,
      errors
    );
    return {
      aiTools: aiTools ?? emptyReport(),
      ideTools: ideTools ?? emptyReport(),
      pluginDrift: aiTools?.pluginDrift ?? [],
      errors,
    };
  }

  private async collectCategoryReports(
    useCase: StatusQuery,
    projectRoot: string,
    errors: GlobalExecutionError[]
  ): Promise<[StatusReport | null, StatusReport | null]> {
    const aiTools = await this.runScope(
      () => useCase.execute({ projectRoot, category: "ai" }),
      "ai",
      errors
    );
    const ideTools = await this.runScope(
      () => useCase.execute({ projectRoot, category: "ide" }),
      "ide",
      errors
    );
    return [aiTools, ideTools];
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
}

function emptyReport() {
  return { tools: [], pluginDrift: [], inSync: true };
}
