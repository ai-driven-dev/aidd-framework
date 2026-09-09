export class HooksCapability {
  readonly consumes: readonly string[];

  constructor(
    readonly params: {
      outputPath: string;
      mergeStrategy?: "user-prime" | "none";
      entrySection?: string;
      mergeFn?: (existing: string, incoming: string) => string;
      consumes?: readonly string[];
    }
  ) {
    this.consumes = params.consumes ?? [];
  }

  buildOutputPath(): string {
    return this.params.outputPath;
  }

  merge(existing: string, incoming: string): string {
    if (this.params.mergeFn !== undefined) {
      return this.params.mergeFn(existing, incoming);
    }
    return incoming;
  }

  getMergeStrategy(): "user-prime" | "none" {
    return this.params.mergeStrategy ?? "user-prime";
  }

  getEntrySection(): string | null {
    return this.params.entrySection ?? null;
  }

  accepts(relativePath: string): boolean {
    return relativePath === this.params.outputPath;
  }

  equals(other: HooksCapability): boolean {
    return (
      this.params.outputPath === other.params.outputPath &&
      this.params.mergeStrategy === other.params.mergeStrategy &&
      this.params.entrySection === other.params.entrySection
    );
  }
}
