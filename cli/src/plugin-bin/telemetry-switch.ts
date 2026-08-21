#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { telemetryConfigPath } from "../domain/models/telemetry-switch.js";

/**
 * Whether AIDD may measure this project, and nothing else.
 *
 * Ships inside the **init** skill, which owns allowing measurement. Reading what was
 * measured is a different responsibility and lives in a different skill with its own
 * script, so neither ever opens a file belonging to the other.
 *
 * Needs nothing installed: the `aidd` CLI keeps every command it has, and is the route to
 * a service outside this machine rather than the route to switching a boolean in it.
 */
const USAGE = "Usage: telemetry-switch on | telemetry-switch off\n";

function asObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** A missing or unparseable file reads as an empty object — the same failure direction the
 * switch parser takes everywhere else, so a damaged file is rewritten rather than left
 * blocking every hook that reads it. */
async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    return asObject(JSON.parse(await readFile(path, "utf-8")));
  } catch {
    return {};
  }
}

/** Merges into whatever the project's config already holds rather than replacing it: the
 * file is the project's, and this owns exactly one key inside it. */
async function setSwitch(projectRoot: string, enabled: boolean): Promise<string> {
  const path = telemetryConfigPath(projectRoot);
  const existing = await readJsonObject(path);
  const telemetry = asObject(existing.telemetry);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    `${JSON.stringify({ ...existing, telemetry: { ...telemetry, enabled } }, null, 2)}\n`,
    "utf-8"
  );
  return path;
}

async function main(): Promise<number> {
  const wanted = process.argv[2];
  if (wanted !== "on" && wanted !== "off") {
    process.stderr.write(USAGE);
    return 1;
  }
  // Deliberately touches no tool's own settings. Reading a session locally needs no export
  // turned on, so allowing measurement costs one boolean and configures nothing else.
  const path = await setSwitch(process.cwd(), wanted === "on");
  process.stdout.write(`AIDD telemetry: ${wanted} (${path})\n`);
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
