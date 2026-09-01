import { EmptyLocalSourcePathError, MarketplaceSourceKindError } from "../../kernel/errors.js";

export const DEFAULT_FRAMEWORK_REPO = "ai-driven-dev/framework";

export type MarketplaceSourceModeValue =
  | { kind: "remote"; repo: string; ref?: string }
  | { kind: "local"; path: string };

export class MarketplaceSourceMode {
  private constructor(private readonly value: MarketplaceSourceModeValue) {}

  get kind(): MarketplaceSourceModeValue["kind"] {
    return this.value.kind;
  }

  get repo(): string {
    if (this.value.kind !== "remote") throw new MarketplaceSourceKindError("remote");
    return this.value.repo;
  }

  get ref(): string | undefined {
    if (this.value.kind !== "remote") return undefined;
    return this.value.ref;
  }

  get path(): string {
    if (this.value.kind !== "local") throw new MarketplaceSourceKindError("local");
    return this.value.path;
  }

  static remote(repo?: string, ref?: string): MarketplaceSourceMode {
    return new MarketplaceSourceMode({
      kind: "remote",
      repo: repo ?? DEFAULT_FRAMEWORK_REPO,
      ref,
    });
  }

  static local(path: string): MarketplaceSourceMode {
    if (!path) throw new EmptyLocalSourcePathError();
    return new MarketplaceSourceMode({ kind: "local", path });
  }

  equals(other: MarketplaceSourceMode): boolean {
    if (this.value.kind !== other.value.kind) return false;
    if (this.value.kind === "remote" && other.value.kind === "remote") {
      return this.value.repo === other.value.repo && this.value.ref === other.value.ref;
    }
    if (this.value.kind === "local" && other.value.kind === "local") {
      return this.value.path === other.value.path;
    }
    return false;
  }
}
