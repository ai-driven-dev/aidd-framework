import { InMemoryFileAdapter } from "./in-memory-file-adapter.js";

type FaultableMethod = "readFile" | "realpath" | "listDirectory" | "deleteDirectory";

export class FaultingFileAdapter extends InMemoryFileAdapter {
  private readonly faults = new Map<string, Error>();

  failOn(method: FaultableMethod, path: string, error: Error): void {
    this.faults.set(faultKey(method, path), error);
  }

  override async readFile(path: string): Promise<string> {
    this.throwIfFaulted("readFile", path);
    return super.readFile(path);
  }

  override async realpath(path: string): Promise<string> {
    this.throwIfFaulted("realpath", path);
    return super.realpath(path);
  }

  override async listDirectory(dirPath: string): Promise<string[]> {
    this.throwIfFaulted("listDirectory", dirPath);
    return super.listDirectory(dirPath);
  }

  override async deleteDirectory(dirPath: string): Promise<void> {
    this.throwIfFaulted("deleteDirectory", dirPath);
    return super.deleteDirectory(dirPath);
  }

  private throwIfFaulted(method: FaultableMethod, path: string): void {
    const error = this.faults.get(faultKey(method, path));
    if (error !== undefined) throw error;
  }
}

export function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: planted by the test`), { code });
}

function faultKey(method: FaultableMethod, path: string): string {
  return `${method}:${path.replaceAll("\\", "/")}`;
}
