import { join } from "node:path";
import type { FileReader } from "../../../../kernel/ports/file-reader.js";
import { ProjectContext, type Stack } from "../../domain/project-context.js";

const TS_SIGNALS = ["tsconfig.json", "package.json"];
const PYTHON_SIGNALS = ["pyproject.toml", "setup.py", "requirements.txt"];
const MONOREPO_SIGNALS = ["pnpm-workspace.yaml", "nx.json", "turbo.json", "lerna.json"];
const FRAMEWORK_MANIFEST = ".aidd/manifest.json";

export interface ProjectContextDetectorOptions {
  projectRoot: string;
}

export class ProjectContextDetectorUseCase {
  constructor(private readonly fs: FileReader) {}

  async execute(options: ProjectContextDetectorOptions): Promise<ProjectContext> {
    const { projectRoot } = options;
    const [stack, isMonorepo, hasFramework] = await Promise.all([
      this.detectStack(projectRoot),
      this.detectMonorepo(projectRoot),
      this.detectFramework(projectRoot),
    ]);
    return new ProjectContext({ stack, isMonorepo, hasFramework });
  }

  private async detectStack(projectRoot: string): Promise<Stack> {
    if (await this.anyExists(projectRoot, TS_SIGNALS)) return "typescript";
    if (await this.anyExists(projectRoot, PYTHON_SIGNALS)) return "python";
    return "unknown";
  }

  private async detectMonorepo(projectRoot: string): Promise<boolean> {
    if (await this.anyExists(projectRoot, MONOREPO_SIGNALS)) return true;
    return this.hasPackageJsonWorkspaces(projectRoot);
  }

  private async hasPackageJsonWorkspaces(projectRoot: string): Promise<boolean> {
    const pkgPath = join(projectRoot, "package.json");
    if (!(await this.fs.fileExists(pkgPath))) return false;
    const content = await this.fs.readFile(pkgPath);
    const parsed = JSON.parse(content) as { workspaces?: unknown };
    return parsed.workspaces !== undefined;
  }

  private async detectFramework(projectRoot: string): Promise<boolean> {
    return this.fs.fileExists(join(projectRoot, FRAMEWORK_MANIFEST));
  }

  private async anyExists(projectRoot: string, files: readonly string[]): Promise<boolean> {
    for (const f of files) {
      if (await this.fs.fileExists(join(projectRoot, f))) return true;
    }
    return false;
  }
}
