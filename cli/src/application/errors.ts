export class NoManifestError extends Error {
  constructor() {
    super("No AIDD manifest found. Run `aidd setup` to initialize your project.");
    this.name = "NoManifestError";
  }
}

export class AiddFilesDetectedError extends Error {
  constructor() {
    super(
      "AIDD files detected but no manifest found.\nRun `aidd setup` to register existing files."
    );
    this.name = "AiddFilesDetectedError";
  }
}

export class AdoptRequiresVersionError extends Error {
  constructor(diagnostic = "") {
    const suffix = diagnostic ? `\n\n${diagnostic}` : "";
    super(
      `--from <version|path> is required for adopt.\nExample: aidd setup --ai claude --from 3.6.0${suffix}`
    );
    this.name = "AdoptRequiresVersionError";
  }
}

export class NotAuthenticatedError extends Error {
  constructor() {
    super("Not authenticated. Run `aidd auth login`.");
    this.name = "NotAuthenticatedError";
  }
}

export class AlreadyInitializedError extends Error {
  constructor(message = "Already initialized. Use `aidd update` to upgrade.") {
    super(message);
    this.name = "AlreadyInitializedError";
  }
}

export class InputRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputRequiredError";
  }
}

export class ToolNotInstalledError extends Error {
  constructor(toolId: string, context?: string) {
    super(context ? `${context} '${toolId}' is not installed.` : `${toolId} is not installed`);
    this.name = "ToolNotInstalledError";
  }
}

export class InvalidCategoryError extends Error {
  constructor(category: string) {
    super(`Invalid category '${category}'. Use 'ai' or 'ide'.`);
    this.name = "InvalidCategoryError";
  }
}

export class InvalidTelemetryPeriodError extends Error {
  constructor(value: string, maxDays: number) {
    super(`Invalid --days '${value}'. Expected an integer between 1 and ${maxDays}.`);
    this.name = "InvalidTelemetryPeriodError";
  }
}

/** One sentence for one consequence: writing a git-tracked file that turns telemetry on for
 * everyone who clones. `endpoint --scope project` and `telemetry on` both have exactly this
 * consequence — the parameterised `action` and `trackedPath` are the only two things that
 * differ between them, so they share the one error rather than each writing its own
 * sentence for the same fact. */
export class TelemetryProjectScopeRequiresYesError extends Error {
  constructor(action: string, trackedPath: string) {
    super(
      `${action} writes the git-tracked ${trackedPath}, turning telemetry on for ` +
        "everyone who clones. Pass --yes to confirm."
    );
    this.name = "TelemetryProjectScopeRequiresYesError";
  }
}

export class IdentityNotOptedInError extends Error {
  constructor() {
    super("No identity to name yet. Run `aidd telemetry identity on` first.");
    this.name = "IdentityNotOptedInError";
  }
}

export class EmptyDisplayNameError extends Error {
  constructor() {
    super("`aidd telemetry identity name` needs a non-empty value.");
    this.name = "EmptyDisplayNameError";
  }
}

export class IdentityRequiredToLinkError extends Error {
  constructor() {
    super("No identity to link onto yet. Run `aidd telemetry identity on` first.");
    this.name = "IdentityRequiredToLinkError";
  }
}

export class EmptyIdentifierError extends Error {
  constructor(command: "use" | "link") {
    super(`\`aidd telemetry identity ${command}\` needs a non-empty value.`);
    this.name = "EmptyIdentifierError";
  }
}
