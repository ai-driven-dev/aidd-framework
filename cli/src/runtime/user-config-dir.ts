import { homedir } from "node:os";
import { join } from "node:path";

/** What belongs to the user rather than to a project. `AIDD_USER_CONFIG_DIR` overrides it
 * outright, which is how the suites stay out of a real home directory; `XDG_CONFIG_HOME`
 * names a config root a person already chose, honored before the `~/.config` default. */
export function userConfigDir(): string {
  if (process.env.AIDD_USER_CONFIG_DIR) return process.env.AIDD_USER_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "aidd");
  return join(homedir(), ".config", "aidd");
}
