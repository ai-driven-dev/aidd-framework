/** Where a registration lives: bound to one project, or to the user across all of them.
 * Kernel vocabulary because a tool's plugin CLI is driven with a scope and must name it
 * without importing the context that fetches content. */
export type MarketplaceScope = "project" | "user";
