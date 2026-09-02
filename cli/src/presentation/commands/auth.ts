import type { Command } from "commander";
import { InputRequiredError } from "../../application/errors.js";
import { AIDD_DIR } from "../../kernel/paths.js";
import type { AuthCredential, AuthLevel } from "../../runtime/auth/auth.js";
import { AuthLoginUseCase } from "../../runtime/auth/auth-login-use-case.js";
import { AuthLogoutUseCase } from "../../runtime/auth/auth-logout-use-case.js";
import { AuthStatusUseCase } from "../../runtime/auth/auth-status-use-case.js";
import { createDeps } from "../../runtime/wiring/framework.js";
import { ErrorHandler } from "../error-handler.js";
import { parseGlobalOptions } from "./global-options.js";

export function registerAuthCommand(program: Command): void {
  const authCmd = program.command("auth").description("Manage authentication");
  authCmd.action(() => authCmd.help());

  authCmd
    .command("login")
    .description("Authenticate with GitHub")
    .option("--gh", "Use GitHub CLI token", false)
    .option("--token <value>", "Personal access token")
    .option("--level <user|project>", "Storage level (user or project)")
    .action(async (cmdOptions: { gh: boolean; token?: string; level?: string }) => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      if (cmdOptions.gh && cmdOptions.token) {
        output.error("--gh and --token are mutually exclusive.");
        process.exit(1);
      }
      if (!cmdOptions.gh && !cmdOptions.token && !process.stdout.isTTY) {
        output.error("Use --gh or --token <value> in non-interactive mode.");
        process.exit(1);
      }
      if (!cmdOptions.level && !process.stdout.isTTY) {
        output.error("Use --level <user|project> in non-interactive mode.");
        process.exit(1);
      }
      const rawLevel = cmdOptions.level;
      if (rawLevel !== undefined && rawLevel !== "user" && rawLevel !== "project") {
        output.error("--level must be 'user' or 'project'.");
        process.exit(1);
      }

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const level: AuthLevel =
          (rawLevel as AuthLevel) ??
          (await deps.prompter.select<AuthLevel>("Storage level:", [
            { name: "User (~/.config/aidd/auth.json)", value: "user" },
            { name: `Project (${AIDD_DIR}/auth.json)`, value: "project" },
          ]));

        let credential: AuthCredential;
        if (cmdOptions.gh) {
          credential = { method: "external", provider: "gh" };
        } else if (cmdOptions.token) {
          credential = { method: "stored", token: cmdOptions.token };
        } else {
          const wantsPat = await deps.prompter.confirm("Do you have a Personal Access Token?");
          if (!wantsPat) {
            credential = { method: "external", provider: "gh" };
          } else {
            const token = await deps.prompter.input("Paste your GitHub Personal Access Token:");
            if (!token) throw new InputRequiredError("Token cannot be empty.");
            credential = { method: "stored", token };
          }
        }

        const result = await new AuthLoginUseCase(deps.credentialStore).execute({
          credential,
          level,
        });
        output.success(`Authenticated as ${result.login} (${result.level})`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  authCmd
    .command("logout")
    .description("Remove stored authentication")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await new AuthLogoutUseCase(deps.credentialStore).execute();

        if (!result.found) {
          output.info("Not authenticated.");
          return;
        }

        if (result.hint === "external-provider-cleanup") {
          output.info(
            "To fully logout, run the external provider's logout command (e.g. gh auth logout)."
          );
        }

        output.success(`Logged out (${result.level})`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });

  authCmd
    .command("status")
    .description("Show authentication status")
    .action(async () => {
      const { verbose, output, projectRoot } = parseGlobalOptions(program);
      const errorHandler = new ErrorHandler(output);

      try {
        const deps = await createDeps(projectRoot, { verbose }, output);
        const result = await new AuthStatusUseCase(deps.credentialStore).execute();
        if (!result.authenticated) {
          output.info("Not authenticated.");
          return;
        }
        output.success(`Authenticated as ${result.login} (${result.level})`);
      } catch (error) {
        errorHandler.handle(error);
      }
    });
}
