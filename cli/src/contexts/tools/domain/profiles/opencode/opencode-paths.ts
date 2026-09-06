/**
 * Where OpenCode keeps what this CLI writes for it.
 *
 * Held apart from the profile so the build contract can read the same values: the profile
 * imports the contract, so the contract cannot import the profile back.
 */

export const OPENCODE_DIRECTORY = ".opencode/";

/**
 * The directory OpenCode's own plugin loader scans (`{plugin,plugins}/*.{ts,js}`,
 * one level, no `hooks` family — see the design note this fixes in
 * opencode-and-scope.md, Lot A). Not where a plugin's hook scripts land any more:
 * only a script literally named `OPENCODE_PLUGIN_ENTRY_BASENAME` belongs here,
 * renamed to the plugin's own name so two plugins delivering one cannot collide.
 */
export const OPENCODE_FLAT_HOOKS_DIR = `${OPENCODE_DIRECTORY}plugin/`;

/** Where a plugin's hook scripts land instead, namespaced per plugin — the same
 * shape `.claude/hooks/<plugin>/` and `.cursor/hooks/<plugin>/` already use. No
 * family the loader scans is named "hooks", so nothing here is ever imported. */
export const OPENCODE_HOOKS_DIR = `${OPENCODE_DIRECTORY}hooks/`;

/**
 * The one hook filename that is, by convention, a plugin's own OpenCode plugin
 * module — the runtime the loader is meant to import — rather than a script an
 * external bridge must be told to run. See `OPENCODE_FLAT_HOOKS_DIR`.
 */
export const OPENCODE_PLUGIN_ENTRY_BASENAME = "opencode-plugin.js";
