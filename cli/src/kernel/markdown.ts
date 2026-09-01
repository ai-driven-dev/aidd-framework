const FRONTMATTER_DELIMITER = "---";

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const lines = content.split("\n");

  if (lines[0]?.trim() !== FRONTMATTER_DELIMITER) {
    return { frontmatter: {}, body: content };
  }

  const closingIndex = lines.slice(1).findIndex((l) => l.trim() === FRONTMATTER_DELIMITER);
  if (closingIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterLines = lines.slice(1, closingIndex + 1);
  const bodyLines = lines.slice(closingIndex + 2);

  const frontmatter = parseYamlLike(frontmatterLines);
  const body = bodyLines.join("\n");

  return { frontmatter, body };
}

export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  if (Object.keys(frontmatter).length === 0) {
    return body.replace(/^\n/, "");
  }

  const lines = [FRONTMATTER_DELIMITER];

  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        const s = String(item);
        // Glob patterns (*, ?, {) are syntactically ambiguous in YAML — quote them to prevent misinterpretation.
        lines.push(
          s.includes("*") || s.includes("?") || s.startsWith("{") ? `  - "${s}"` : `  - ${s}`
        );
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      const s = String(value);
      // JSON-array strings (e.g. from cursor globs) are emitted raw so they stay as YAML inline arrays.
      if (s.startsWith("[") && s.endsWith("]")) {
        lines.push(`${key}: ${s}`);
      } else {
        lines.push(`${key}: '${s.replaceAll("'", "''")}'`);
      }
    }
  }

  lines.push(FRONTMATTER_DELIMITER);

  return `${lines.join("\n")}\n${body}`;
}

function parseYamlLike(lines: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const keyOnlyMatch = /^(\w[\w-]*):\s*$/.exec(line);
    const keyValueMatch = /^(\w[\w-]*):\s*(.+)$/.exec(line);
    if (keyOnlyMatch) {
      const { items, next } = collectListBlock(lines, i + 1);
      result[keyOnlyMatch[1]] = items;
      i = next;
    } else if (keyValueMatch) {
      const rawValue = keyValueMatch[2].trim();
      if (isBlockScalarIndicator(rawValue)) {
        const { value, next } = collectScalarBlock(lines, i + 1, rawValue.startsWith(">"));
        result[keyValueMatch[1]] = value;
        i = next;
      } else {
        result[keyValueMatch[1]] = parseScalar(rawValue);
        i++;
      }
    } else {
      i++;
    }
  }
  return result;
}

function collectListBlock(lines: string[], start: number): { items: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const match = /^\s{2,}-\s+(.+)$/.exec(lines[i]);
    if (!match) break;
    items.push(String(parseScalar(match[1].trim())));
    i++;
  }
  return { items, next: i };
}

function collectScalarBlock(
  lines: string[],
  start: number,
  folded: boolean
): { value: string; next: number } {
  const collected: string[] = [];
  let i = start;
  while (i < lines.length && /^\s+/.test(lines[i])) {
    collected.push(lines[i].trim());
    i++;
  }
  const value = folded ? collected.join(" ").trimEnd() : collected.join("\n").trimEnd();
  return { value, next: i };
}

function isBlockScalarIndicator(s: string): boolean {
  return s === ">-" || s === ">" || s === "|-" || s === "|";
}

function parseScalar(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null" || value === "~") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (value.length > 1 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }
  return value;
}
