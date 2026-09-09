import type { Prompter } from "../../../../kernel/ports/prompter.js";
import { ResolveRestoreDecisionUseCase } from "./resolve-restore-decision.js";

export interface DriftDescriptor {
  relativePath: string;
  reason: "deleted" | "modified";
}

/**
 * Entries that can actually be restored (`drift`), and entries the manifest still tracks as drifted
 * but the current distribution no longer provides anything to restore them from (`unrestorable`).
 */
export interface DriftCollection<TDrift extends DriftDescriptor> {
  drift: TDrift[];
  unrestorable: DriftDescriptor[];
}

/**
 * The I/O leaf: everything that differs between restoring a whole file and merging drifted keys
 * back into one. The skeleton never branches on which leaf it is running.
 */
export interface RestoreDriftLeaf<TDrift extends DriftDescriptor, TResult> {
  collectDrift(): Promise<DriftCollection<TDrift>>;
  restore(entry: TDrift): Promise<void>;
  buildResult(restored: string[], kept: string[], unrestorable: string[]): TResult;
}

/** The single place the keep/overwrite decision lives: both restore flows inject their own leaf
 * rather than duplicating the loop. */
export class RestoreDriftEntriesUseCase {
  private readonly resolveDecision: ResolveRestoreDecisionUseCase;

  constructor(prompter: Prompter) {
    this.resolveDecision = new ResolveRestoreDecisionUseCase(prompter);
  }

  async execute<TDrift extends DriftDescriptor, TResult>(
    leaf: RestoreDriftLeaf<TDrift, TResult>,
    force: boolean,
    interactive: boolean
  ): Promise<TResult | null> {
    const { drift, unrestorable } = await leaf.collectDrift();
    if (drift.length === 0 && unrestorable.length === 0) return null;

    const restored: string[] = [];
    const kept: string[] = [];

    for (const entry of drift) {
      const skip = await this.resolveDecision.execute({
        relativePath: entry.relativePath,
        reason: entry.reason,
        force,
        interactive,
      });
      if (skip) {
        kept.push(entry.relativePath);
        continue;
      }
      await leaf.restore(entry);
      restored.push(entry.relativePath);
    }

    return leaf.buildResult(
      restored,
      kept,
      unrestorable.map((entry) => entry.relativePath)
    );
  }
}
