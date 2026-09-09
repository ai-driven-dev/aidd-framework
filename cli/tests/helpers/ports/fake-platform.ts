import type { Platform } from "../../../src/runtime/platform/platform.js";

export class FakePlatform implements Platform {
  constructor(private readonly platformName: string = "linux") {}

  current(): string {
    return this.platformName;
  }
}

export const linuxPlatform: Platform = new FakePlatform("linux");
export const win32Platform: Platform = new FakePlatform("win32");
export const darwinPlatform: Platform = new FakePlatform("darwin");
