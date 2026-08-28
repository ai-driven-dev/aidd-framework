import { homedir as osHomedir } from "node:os";
import { join } from "node:path";

/**
 * The OS user's home directory, `HOME` first.
 *
 * `os.homedir()` already reads `$HOME` on POSIX, so calling it directly is invisible there.
 * On Windows it never does — it reads `USERPROFILE` instead, and falls back to the current
 * user's profile directory (https://nodejs.org/api/os.html#oshomedir) — so a `HOME` a person
 * sets under Git Bash/MSYS2, or a test sandboxes a process under, is silently ignored by a
 * bare `homedir()` call there.
 *
 * This is the same rule the plugin's own `skills/01-cost/scripts/lib/readers.cjs` (`homeDir`) and
 * `skills/00-init/scripts/lib/identity.cjs` apply. Every site here that has to agree with the plugin on
 * which directory holds a tool's session files, the telemetry sink, or this machine's
 * identity file must resolve it through this function rather than `node:os`'s `homedir()`
 * directly — otherwise the two sides answer different questions on Windows while looking
 * identical on POSIX (see `telemetry-plugin-matches-cli.e2e.test.ts`).
 */
export function resolveHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  osHomedirFn: () => string = osHomedir
): string {
  return env.HOME || osHomedirFn();
}

/**
 * `<profile>/.config/aidd` on POSIX, `%APPDATA%/aidd` on Windows — the directory a
 * *person's own choice* lives under, never a project's. Isolated as its own function,
 * beside `resolveHomeDir`, because its contract refuses `AIDD_USER_CONFIG_DIR` on purpose:
 * that variable is a location a repository or a CI job can set, and reaching the identity
 * file through it would not be this person's own choice to make. The telemetry sink is
 * deliberately not a caller of this function — `TelemetrySinkAdapter`'s own constructor
 * honours that variable, and its `defaultConfigDir` additionally falls back to a legacy
 * POSIX-shaped directory on Windows, a concern this function has no reason to carry.
 */
export function resolveAiddConfigDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "aidd");
  }
  return join(resolveHomeDir(), ".config", "aidd");
}
