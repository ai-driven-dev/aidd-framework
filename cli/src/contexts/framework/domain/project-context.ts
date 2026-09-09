export type Stack = "typescript" | "python" | "unknown";

export interface ProjectContextData {
  stack: Stack;
  isMonorepo: boolean;
  hasFramework: boolean;
}

export class ProjectContext {
  readonly stack: Stack;
  readonly isMonorepo: boolean;
  readonly hasFramework: boolean;

  constructor(data: ProjectContextData) {
    this.stack = data.stack;
    this.isMonorepo = data.isMonorepo;
    this.hasFramework = data.hasFramework;
  }

  describe(): string {
    const bits: string[] = [];
    if (this.stack !== "unknown") bits.push(this.stack);
    if (this.isMonorepo) bits.push("monorepo");
    if (this.hasFramework) bits.push("AIDD present");
    return bits.length === 0 ? "unknown project" : bits.join(" · ");
  }
}
