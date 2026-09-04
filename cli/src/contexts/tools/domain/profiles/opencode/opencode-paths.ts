/**
 * Where OpenCode keeps what this CLI writes for it.
 *
 * Held apart from the profile so the build contract can read the same values: the profile
 * imports the contract, so the contract cannot import the profile back.
 */

export const OPENCODE_DIRECTORY = ".opencode/";

/** The directory OpenCode's own plugin loader scans — a flat one, shared by every plugin. */
export const OPENCODE_FLAT_HOOKS_DIR = `${OPENCODE_DIRECTORY}plugin/`;
