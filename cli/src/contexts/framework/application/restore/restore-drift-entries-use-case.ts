import type { Prompter } from "../../../../kernel/ports/prompter.js";
import { ResolveRestoreDecisionUseCase } from "./resolve-restore-decision.js";

export interface DriftDescriptor {
  relativePath: string;
  reason: "deleted" | "modified";
}

/**
 * What a leaf's drift scan found: entries that can actually be restored (`drift`),
 * and entries the manifest still tracks as drifted but the current distribution no
 * longer provides anything to restore them from (`unrestorable`) — e.g. a file
 * dropped in a newer framework version, or a tool whose content set changed.
 */
export interface DriftCollection<TDrift extends DriftDescriptor> {
  drift: TDrift[];
  unrestorable: DriftDescriptor[];
}

/**
 * The I/O leaf: everything that differs between restoring a whole file and
 * merging drifted keys back into one. The skeleton below never branches on
 * which leaf it is running — it only calls these three methods.
 */
export interface RestoreDriftLeaf<TDrift extends DriftDescriptor, TResult> {
  collectDrift(): Promise<DriftCollection<TDrift>>;
  restore(entry: TDrift): Promise<void>;
  buildResult(restored: string[], kept: string[], unrestorable: string[]): TResult;
}

/**
 * Shared skeleton for both restore flows: collect drift, delegate the
 * keep/overwrite decision to ResolveRestoreDecisionUseCase, then partition
 * into restored/kept. This is the single place that decision logic lives —
 * both restore use-cases inject their own leaf instead of duplicating the loop.
 */
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
