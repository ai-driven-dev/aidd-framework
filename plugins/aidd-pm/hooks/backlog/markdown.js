// Pure Markdown reading. Nothing here knows what a backlog artifact means.

function unquote(value) {
  const trimmed = value.trim();
  const quoted =
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")));
  return quoted ? trimmed.slice(1, -1) : trimmed;
}

function parseInlineList(value) {
  const inner = value.slice(1, -1).trim();
  return inner ? inner.split(",").map(unquote) : [];
}

function isIndented(line) {
  return /^(?: {4}|\t)/.test(line);
}

function withoutFencedCode(body) {
  return body.replace(/```[\s\S]*?```/g, "").replace(/~~~[\s\S]*?~~~/g, "");
}

/** Frontmatter as a flat map, supporting inline and block lists. */
function parseFrontmatter(content) {
  const lines = content.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").split("\n");
  if (lines[0] !== "---") return { error: "missing YAML frontmatter" };

  const end = lines.indexOf("---", 1);
  if (end < 0) return { error: "unclosed YAML frontmatter" };

  const data = {};
  let listKey;

  for (let index = 1; index < end; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith("#")) continue;

    const item = line.match(/^\s{2}-\s*(.*)$/);
    if (item && listKey) {
      data[listKey].push(unquote(item[1]));
      continue;
    }

    const entry = line.match(/^([a-z][a-z0-9_]*):(?:\s*(.*))?$/);
    if (!entry) return { error: `unsupported YAML at line ${index + 1}` };

    const [, key, raw = ""] = entry;
    if (Object.hasOwn(data, key)) return { error: `duplicate field "${key}"` };
    if (!raw.trim()) {
      data[key] = [];
      listKey = key;
    } else {
      const value = raw.trim();
      data[key] = value.startsWith("[") && value.endsWith("]") ? parseInlineList(value) : unquote(value);
      listKey = undefined;
    }
  }

  return { data, body: lines.slice(end + 1).join("\n") };
}

/** The H1 title, without its artifact-type prefix. */
function titleFromBody(body) {
  const visible = withoutFencedCode(body).split("\n").filter((line) => !isIndented(line)).join("\n");
  const heading = visible.match(/^#\s+(.+?)\s*$/m)?.[1];
  return heading?.replace(/^(?:Epic|Story|Task|Spike|Defect):\s*/i, "").trim() || "";
}

/** A section counts as present only when it holds something beyond placeholders. */
function hasSection(body, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = `${body}\n## __END__\n`.match(new RegExp(`^## ${escaped}\\s*$([\\s\\S]*?)(?=^## )`, "m"));
  if (!match) return false;
  const content = match[1]
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>\n]+>/g, "")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+\.|\|)\s*/, "").replaceAll("|", ""))
    .join("");
  return content.trim().length > 0;
}

/** A second frontmatter block copied into the body. */
function hasEmbeddedFrontmatter(body) {
  return /(?:^|\n)---\s*\n(?:\s*\n)*(?:(?:[a-z][a-z0-9_]*:.*|  - .*)\n)+(?:\s*\n)*---(?:\n|$)/m.test(
    withoutFencedCode(body),
  );
}

/**
 * A copy of the frontmatter sits in the preamble, in a section heading, or in a
 * metadata table. Inside a section, these words are ordinary prose.
 */
function hasCopiedMetadata(body, fields) {
  const pattern = new RegExp(`^(?:#{1,6}\\s+|[-*+]\\s+|\\|\\s*)?(?:\\*\\*)?(?:${fields.join("|")})(?:\\*\\*)?\\s*:`, "i");
  let preamble = true;
  for (const line of withoutFencedCode(body).split("\n")) {
    if (isIndented(line)) continue;
    const trimmed = line.trim();
    const heading = trimmed.startsWith("## ");
    if ((preamble || heading || trimmed.startsWith("|")) && pattern.test(trimmed)) return true;
    if (heading) preamble = false;
  }
  return false;
}

/** A template placeholder left behind. Fenced code keeps its angle brackets. */
function hasPlaceholder(body) {
  return /<[^>\n]+>/.test(withoutFencedCode(body).replace(/<!--[\s\S]*?-->/g, ""));
}

module.exports = {
  hasCopiedMetadata,
  hasEmbeddedFrontmatter,
  hasPlaceholder,
  hasSection,
  parseFrontmatter,
  titleFromBody,
};
