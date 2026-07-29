import type { Prompter } from "../../../domain/ports/prompter.js";
import { ResolveRestoreDecisionUseCase } from "./resolve-restore-decision.js";

interface DriftDescriptor {
  relativePath: string;
  reason: "deleted" | "modified";
}

/**
 * The I/O leaf: everything that differs between restoring a whole file and
 * merging drifted keys back into one. The skeleton below never branches on
 * which leaf it is running — it only calls these three methods.
 */
export interface RestoreDriftLeaf<TDrift extends DriftDescriptor, TResult> {
  collectDrift(): Promise<TDrift[]>;
  restore(entry: TDrift): Promise<void>;
  buildResult(restored: string[], kept: string[]): TResult;
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
    const drift = await leaf.collectDrift();
    if (drift.length === 0) return null;

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

    return leaf.buildResult(restored, kept);
  }
}
