import { homedir as osHomedir } from "node:os";
import { join } from "node:path";

/** `HOME` first, because `os.homedir()` never reads it on Windows: a `HOME` set under Git
 * Bash or by a test sandbox is ignored by a bare call there. Every site naming a tool's
 * session files, the telemetry sink or the identity file resolves through here. */
export function resolveHomeDir(
  env: NodeJS.ProcessEnv = process.env,
  osHomedirFn: () => string = osHomedir
): string {
  return env.HOME || osHomedirFn();
}

/**
 * `<profile>/.config/aidd` on POSIX, `%APPDATA%/aidd` on Windows — the directory a
 * *person's own choice* lives under, never a project's. It refuses `AIDD_USER_CONFIG_DIR`
 * on purpose: a repository or a CI job can set that variable, so reaching the identity file
 * through it would not be this person's own choice to make. The telemetry sink is
 * deliberately not a caller — `TelemetrySinkAdapter` honours that variable itself, and
 * falls back to a legacy POSIX-shaped directory on Windows.
 */
export function resolveAiddConfigDir(): string {
  if (process.platform === "win32" && process.env.APPDATA) {
    return join(process.env.APPDATA, "aidd");
  }
  return join(resolveHomeDir(), ".config", "aidd");
}
