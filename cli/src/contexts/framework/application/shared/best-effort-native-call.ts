import { NativePluginCliError } from "../../../../kernel/errors.js";
import type { Logger } from "../../../../kernel/ports/logger.js";

/**
 * Runs `action`, a call into a tool's own native plugin CLI, and reports whether it ran to
 * completion rather than throwing: a marketplace or plugin ref the host refused to drop must be
 * told apart from one it actually forgot, so a later cache purge never trusts a removal that never
 * happened.
 *
 * Only `NativePluginCliError` is swallowed — every throw a real activator produces is that class,
 * so anything else is a bug in the activator and must propagate.
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
