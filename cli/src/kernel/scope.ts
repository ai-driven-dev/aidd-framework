/**
 * Where a registration lives: bound to one project, or to the user across all of them.
 *
 * Shared vocabulary rather than distribution's own, because a tool's plugin CLI is
 * driven with a scope and must name it without importing the context that fetches
 * content — the kernel is where the two meet.
 */
export type MarketplaceScope = "project" | "user";
