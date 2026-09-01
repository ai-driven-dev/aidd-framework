import { spawn } from "node:child_process";

export function spawnCliCommand(command: string[]): Promise<number> {
  return new Promise((resolve) => {
    spawn(process.execPath, [process.argv[1], ...command], { stdio: "inherit" }).on(
      "close",
      (code) => resolve(code ?? 0)
    );
  });
}
