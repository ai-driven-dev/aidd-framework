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
 * Every site that has to name the directory holding a tool's session files, the telemetry
 * sink, or this machine's identity file resolves it through this function rather than
 * `node:os`'s `homedir()` directly, so one answer serves them all.
 *
 * This rule was once a parity obligation: the plugin's own scripts resolved `HOME` the same
 * way, and an e2e held the two sides to each other. Those scripts are gone, and the hooks
 * that remain resolve no home directory at all - they write beside the repository. The rule
 * stands on the paragraph above alone, which is why it is stated there and not borrowed
 * from a second implementation that no longer exists.
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
