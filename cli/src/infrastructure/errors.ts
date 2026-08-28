export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly url: string
  ) {
    super(`Unexpected HTTP ${statusCode} from ${url}`);
    this.name = "HttpError";
  }
}

export class HttpNotFoundError extends Error {
  constructor(readonly url: string) {
    super(`Resource not found (HTTP 404): ${url}`);
    this.name = "HttpNotFoundError";
  }
}

export class HttpRedirectError extends Error {
  constructor(readonly url: string) {
    super(`HTTP redirect without location header from ${url}`);
    this.name = "HttpRedirectError";
  }
}

export class JsonParseError extends Error {
  constructor(path: string, cause: string) {
    super(`Cannot parse existing JSON at ${path}: ${cause}`);
    this.name = "JsonParseError";
  }
}

export class AuthStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthStorageError";
  }
}

export class TelemetrySinkUnwritableError extends Error {
  constructor(path: string, cause: unknown) {
    super(
      `Telemetry sink directory is not writable: ${path} ` +
        `(${cause instanceof Error ? cause.message : String(cause)})`
    );
    this.name = "TelemetrySinkUnwritableError";
  }
}

/** A write or a delete against the identity file failed for a reason other than the file
 * simply not being there — permission denied, a full disk, and the like. Distinct from
 * `UnreadableIdentityFileError` (domain/errors.ts): that one names a read that could not
 * come back, this one a write or a forget that could not go out. */
export class IdentityWriteError extends Error {
  /** `action` names what the person was doing, because the sentence reaches them: someone
   * withdrawing should not be told a write failed. */
  constructor(filePath: string, cause: unknown, action: "write" | "remove" = "write") {
    super(
      `Could not ${action} the identity file at ${filePath} ` +
        `(${cause instanceof Error ? cause.message : String(cause)}).`
    );
    this.name = "IdentityWriteError";
  }
}

/** A write against the person mapping file failed for a reason other than the file simply
 * not being there — permission denied, a full disk, and the like. Distinct from
 * `UnreadablePersonMappingFileError` (domain/errors.ts): that one names a read that could
 * not come back, this one a write that could not go out. */
export class PersonMappingWriteError extends Error {
  constructor(filePath: string, cause: unknown) {
    super(
      `Could not write the person mapping at ${filePath} ` +
        `(${cause instanceof Error ? cause.message : String(cause)}).`
    );
    this.name = "PersonMappingWriteError";
  }
}

export class GhCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GhCliError";
  }
}

export class AssetNotFoundError extends Error {
  constructor(assetName: string) {
    super(`Bundled asset not found: '${assetName}'`);
    this.name = "AssetNotFoundError";
  }
}
