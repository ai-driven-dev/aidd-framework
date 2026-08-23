import { homedir as osHomedir } from "node:os";

/**
 * The OS user's home directory, `HOME` first.
 *
 * `os.homedir()` already reads `$HOME` on POSIX, so calling it directly is invisible there.
 * On Windows it never does — it reads `USERPROFILE` instead, and falls back to the current
 * user's profile directory (https://nodejs.org/api/os.html#oshomedir) — so a `HOME` a person
 * sets under Git Bash/MSYS2, or a test sandboxes a process under, is silently ignored by a
 * bare `homedir()` call there.
 *
 * This is the same rule the plugin's own `skills/_shared/readers.js` (`homeDir`) and
 * `skills/_shared/identity.js` apply. Every site here that has to agree with the plugin on
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
