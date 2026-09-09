import type { Platform } from "./platform.js";

export class PlatformAdapter implements Platform {
  current(): string {
    return process.platform;
  }
}
