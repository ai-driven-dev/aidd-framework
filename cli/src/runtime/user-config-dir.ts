import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where this CLI keeps what belongs to the user rather than to a project: the
 * user-scope marketplace registry, credentials, the update check, and the built trees
 * of user-scope marketplaces.
 *
 * `AIDD_USER_CONFIG_DIR` overrides it outright, which is how the test suites stay out
 * of a real home directory. Absent that, `XDG_CONFIG_HOME` names the config root a
 * person already chose, honored before the `~/.config` default assumes one.
 */
export function userConfigDir(): string {
  if (process.env.AIDD_USER_CONFIG_DIR) return process.env.AIDD_USER_CONFIG_DIR;
  if (process.env.XDG_CONFIG_HOME) return join(process.env.XDG_CONFIG_HOME, "aidd");
  return join(homedir(), ".config", "aidd");
}
