import type { FileReader } from "../../../domain/ports/file-reader.js";
import type { Hasher } from "../../../domain/ports/hasher.js";
import type { ManifestRepository } from "../../../domain/ports/manifest-repository.js";
import { StatusUseCase } from "../status-use-case.js";
import type { GlobalExecutionError } from "./update-all-use-case.js";

type StatusReport = Awaited<ReturnType<StatusUseCase["execute"]>>;

export interface StatusAllResult {
  aiTools: StatusReport;
  ideTools: StatusReport;
  plugins: StatusReport;
  errors: GlobalExecutionError[];
}

export class StatusAllUseCase {
  constructor(
    private readonly fs: FileReader,
    private readonly manifestRepo: ManifestRepository,
    private readonly hasher: Hasher
  ) {}

  async execute(projectRoot: string): Promise<StatusAllResult> {
    const errors: GlobalExecutionError[] = [];
    const useCase = new StatusUseCase(this.fs, this.manifestRepo, this.hasher);
    const [aiTools, ideTools, plugins] = await this.collectCategoryReports(
      useCase,
      projectRoot,
      errors
    );
    return {
      aiTools: aiTools ?? emptyReport(),
      ideTools: ideTools ?? emptyReport(),
      plugins: plugins ?? emptyReport(),
      errors,
    };
  }

  private async collectCategoryReports(
    useCase: StatusUseCase,
    projectRoot: string,
    errors: GlobalExecutionError[]
  ): Promise<[StatusReport | null, StatusReport | null, StatusReport | null]> {
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
    const plugins = await this.runScope(
      () => useCase.execute({ projectRoot, filterToolId: undefined }),
      "plugins",
      errors
    );
    return [aiTools, ideTools, plugins];
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
