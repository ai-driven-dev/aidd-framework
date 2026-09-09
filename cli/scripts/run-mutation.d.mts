export interface MutationScope {
  readonly mutate: string;
  readonly break: number;
}

export interface MutationReport {
  readonly files?: Readonly<
    Record<string, { readonly mutants: readonly { readonly status: string }[] }>
  >;
}

export function strykerArgs(
  scope: string,
  scopes: Readonly<Record<string, MutationScope>>,
  options?: { readonly force?: boolean }
): string[];
export function scoreOf(report: MutationReport): number;
export function breakVerdict(score: number, declared: MutationScope): string | null;
