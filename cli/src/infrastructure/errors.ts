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
