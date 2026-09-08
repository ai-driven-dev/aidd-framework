import { NativePluginCliError } from "../../../../kernel/errors.js";
import type { Logger } from "../../../../kernel/ports/logger.js";

/**
 * Runs `action`, a call into a tool's own native plugin CLI, and reports whether it
 * actually ran to completion rather than throwing. Shared by every caller that drives
 * a host's own CLI best-effort — `CleanUseCase` (project scope) and
 * `CleanUserScopeUseCase` (machine scope) both need the same answer for the same
 * reason: a marketplace or plugin ref the host refused to drop must still be told
 * apart from one it actually forgot, so a later cache purge never trusts a removal
 * that never happened.
 *
 * Only `NativePluginCliError` is swallowed — every throw
 * `AbstractNativePluginCliAdapter.run` produces is that class, so anything else is a
 * bug in the activator itself, not a host refusing a request, and must propagate.
 */
export function bestEffortNativeCall(logger: Logger, action: () => void, label: string): boolean {
  try {
    action();
    return true;
  } catch (error) {
    if (!(error instanceof NativePluginCliError)) throw error;
    logger.warn(`${label} failed: ${error.message}`);
    return false;
  }
}
