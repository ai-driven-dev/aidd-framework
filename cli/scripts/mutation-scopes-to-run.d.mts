import type { MutationScope } from "./run-mutation.mjs";

export const HARNESS: readonly string[];
export function scopesToRun(
  changed: readonly string[],
  scopes: Readonly<Record<string, MutationScope>>,
  options?: { readonly all?: boolean }
): string[];
