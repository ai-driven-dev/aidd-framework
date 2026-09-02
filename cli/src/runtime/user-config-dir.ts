import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where this CLI keeps what belongs to the user rather than to a project: the
 * user-scope marketplace registry, credentials, the update check, and the built trees
 * of user-scope marketplaces.
 *
 * `AIDD_USER_CONFIG_DIR` overrides it, which is how the test suites stay out of a real
 * home directory.
 */
export function userConfigDir(): string {
  return process.env.AIDD_USER_CONFIG_DIR ?? join(homedir(), ".config", "aidd");
}
