import type { Prompter } from "../../../domain/ports/prompter.js";
import { InputRequiredError } from "../../errors.js";

type BulkDecision = "overwrite-all" | "skip-all";

/**
 * Shared mutable state for bulk conflict resolution within a single update run.
 * Created once per invocation in the fan-out use-case; the same reference is passed
 * to every UpdateOneToolUseCase call so that "overwrite all" / "skip all" persists
 * across tools and files.
 */
export class BulkConflictState {
  private decision: BulkDecision | null = null;

  isSet(): boolean {
    return this.decision !== null;
  }

  get(): BulkDecision | null {
    return this.decision;
  }

  record(choice: BulkDecision): void {
    this.decision = choice;
  }
}

export interface ResolveUpdateDecisionOptions {
  relativePath: string;
  userForce: boolean;
  interactive: boolean;
  bulkState: BulkConflictState;
}

/**
 * Decides whether to overwrite a user-modified file during an update.
 * Returns true when the file should be written (overwrite), false when it should be kept.
 * Throws InputRequiredError when force=false and interactive=false (non-TTY, no --force).
 *
 * Unmodified files are handled by the caller — this use-case is only consulted for modified files.
 */
export class ResolveUpdateDecisionUseCase {
  constructor(private readonly prompter: Prompter) {}

  async execute(options: ResolveUpdateDecisionOptions): Promise<boolean> {
    const { relativePath, userForce, interactive, bulkState } = options;
    if (!userForce && !interactive) {
      throw new InputRequiredError(
        `Use --force to overwrite modified files in non-interactive mode.`
      );
    }
    if (userForce) return true;
    return this.resolveInteractive(relativePath, bulkState);
  }

  private async resolveInteractive(
    relativePath: string,
    bulkState: BulkConflictState
  ): Promise<boolean> {
    const existing = bulkState.get();
    if (existing === "overwrite-all") return true;
    if (existing === "skip-all") return false;
    const decision = await this.prompter.resolveConflictBulk(relativePath, "modified");
    if (decision === "overwrite-all" || decision === "skip-all") {
      bulkState.record(decision);
    }
    return decision === "overwrite" || decision === "overwrite-all";
  }
}
