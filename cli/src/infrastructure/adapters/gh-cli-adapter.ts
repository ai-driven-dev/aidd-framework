import { spawnSync } from "node:child_process";
import type { CliAuthProvider } from "../../domain/ports/oauth-provider.js";
import { AuthenticationError } from "../../kernel/errors.js";
import { GhCliError } from "../errors.js";

export class GhCliAdapter implements CliAuthProvider {
  resolve(): string | null {
    const result = spawnSync("gh", ["auth", "token"], {
      timeout: 3000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.error) {
      // gh not found in PATH
      return null;
    }

    if (result.status !== 0) {
      const detail = result.stderr?.trim() ?? "";
      if (detail.includes("unknown command")) {
        throw new GhCliError(
          'gh CLI is too old to support "gh auth token". Install the latest version from https://cli.github.com'
        );
      }
      throw new GhCliError(
        detail
          ? `gh auth token failed: ${detail}`
          : `gh auth token exited with code ${result.status ?? "unknown"}`
      );
    }

    return result.stdout.trim() || null;
  }

  async verify(): Promise<string> {
    const result = spawnSync("gh", ["api", "user", "--jq", ".login"], {
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.error || result.status !== 0) {
      throw new AuthenticationError("gh CLI");
    }
    const login = result.stdout.trim();
    if (!login) throw new AuthenticationError("gh CLI");
    return login;
  }
}
