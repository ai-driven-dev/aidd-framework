import { parse, stringify } from "smol-toml";

export function parseToml(content: string): Record<string, unknown> {
  return parse(content) as Record<string, unknown>;
}

export function stringifyToml(data: Record<string, unknown>): string {
  return stringify(data as Parameters<typeof stringify>[0]);
}
