import { existsSync } from "node:fs";

export function resolveProjectRoot(): string {
  const pwd = process.env.PWD;
  if (pwd && pwd !== process.cwd() && existsSync(pwd)) return pwd;
  return process.cwd();
}
