/**
 * The variable each tool expands to an installed plugin's own directory. A tool declares which
 * one it speaks (`plugins.pluginRootToken`) and its build contract substitutes the same one,
 * both reading this vocabulary rather than repeating a literal, so the install route and the
 * build route cannot drift apart. The Claude spelling is also the source spelling: plugins are
 * authored against it and every other tool's token is what it gets translated into.
 */

// Split literals to avoid biome's noTemplateCurlyInString warning.
export const CLAUDE_PLUGIN_ROOT_TOKEN = "$" + "{CLAUDE_PLUGIN_ROOT}";
export const CURSOR_PLUGIN_ROOT_TOKEN = "$" + "{CURSOR_PLUGIN_ROOT}";
export const PLUGIN_ROOT_TOKEN = "$" + "{PLUGIN_ROOT}";
