#!/usr/bin/env node
// Generated from cli/src/plugin-bin/telemetry-report.ts and the domain it imports.
// Do not edit here: cli/tests/e2e/telemetry-plugin-standalone.e2e.test.ts rebuilds
// this file and fails when what is committed no longer matches its source.
//
// Bundled rather than imported because a plugin is copied into a project and cannot
// run an install step, and left unminified because it lands in someone else's
// repository, where an unreadable file is a reason not to trust it.
"use strict";

// src/plugin-bin/telemetry-report.ts
var import_node_os2 = require("os");

// src/domain/formats/markdown.ts
var FRONTMATTER_DELIMITER = "---";
function parseFrontmatter(content) {
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
function serializeFrontmatter(frontmatter, body) {
  if (Object.keys(frontmatter).length === 0) {
    return body.replace(/^\n/, "");
  }
  const lines = [FRONTMATTER_DELIMITER];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        const s = String(item);
        lines.push(
          s.includes("*") || s.includes("?") || s.startsWith("{") ? `  - "${s}"` : `  - ${s}`
        );
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      const s = String(value);
      if (s.startsWith("[") && s.endsWith("]")) {
        lines.push(`${key}: ${s}`);
      } else {
        lines.push(`${key}: '${s.replaceAll("'", "''")}'`);
      }
    }
  }
  lines.push(FRONTMATTER_DELIMITER);
  return `${lines.join("\n")}
${body}`;
}
function parseYamlLike(lines) {
  const result = {};
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
function collectListBlock(lines, start) {
  const items = [];
  let i = start;
  while (i < lines.length) {
    const match = /^\s{2,}-\s+(.+)$/.exec(lines[i]);
    if (!match) break;
    items.push(String(parseScalar(match[1].trim())));
    i++;
  }
  return { items, next: i };
}
function collectScalarBlock(lines, start, folded) {
  const collected = [];
  let i = start;
  while (i < lines.length && /^\s+/.test(lines[i])) {
    collected.push(lines[i].trim());
    i++;
  }
  const value = folded ? collected.join(" ").trimEnd() : collected.join("\n").trimEnd();
  return { value, next: i };
}
function isBlockScalarIndicator(s) {
  return s === ">-" || s === ">" || s === "|-" || s === "|";
}
function parseScalar(value) {
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

// src/domain/capabilities/agents-capability.ts
function agentNameFromFrontmatter(fm, fileName) {
  const base = fileName?.split("/").at(-1);
  const name = fm.name ?? base?.replace(/\.md$/, "");
  return typeof name === "string" ? name : void 0;
}
function tomlString(value) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
function buildTomlContent(frontmatter, body) {
  const lines = [
    `name = ${tomlString(String(frontmatter.name ?? ""))}`,
    `description = ${tomlString(String(frontmatter.description ?? ""))}`
  ];
  if (frontmatter.model !== void 0) {
    lines.push(`model = ${tomlString(String(frontmatter.model))}`);
  }
  lines.push(`developer_instructions = """
${body}
"""`);
  return `${lines.join("\n")}
`;
}
function stripSuffix(toolSuffix, fileName) {
  const basename2 = fileName.split("/").at(-1) ?? fileName;
  const dir = fileName.slice(0, fileName.length - basename2.length);
  if (basename2.endsWith(toolSuffix)) {
    return `${dir}${basename2.slice(0, -toolSuffix.length)}.md`;
  }
  return fileName;
}
function toTomlBasename(toolSuffix, fileName) {
  const basename2 = fileName.split("/").at(-1) ?? fileName;
  if (basename2.endsWith(toolSuffix)) {
    return `${basename2.slice(0, -toolSuffix.length)}.toml`;
  }
  if (basename2.endsWith(".md")) {
    return `${basename2.slice(0, -3)}.toml`;
  }
  return `${basename2}.toml`;
}
var AgentsCapability = class {
  constructor(params) {
    this.params = params;
  }
  buildOutputPath(agentName) {
    return `${this.params.directory}agents/${agentName}${this.params.toolSuffix}`;
  }
  buildUserFilePath(userFileName) {
    const basename2 = userFileName.split("/").at(-1) ?? userFileName;
    const { userFileExt } = this.params;
    if (userFileExt !== void 0) {
      const name = basename2.endsWith(".md") ? basename2.slice(0, -3) : basename2;
      return `${this.params.directory}agents/${name}${userFileExt}`;
    }
    return `${this.params.directory}agents/${basename2}`;
  }
  buildInstallPath(relativeFileName) {
    if (this.params.buildInstallPath) return this.params.buildInstallPath(relativeFileName);
    const basename2 = relativeFileName.split("/").at(-1) ?? relativeFileName;
    if (this.params.format === "toml") {
      return `${this.params.directory}agents/${toTomlBasename(this.params.toolSuffix, basename2)}`;
    }
    return stripSuffix(this.params.toolSuffix, `${this.params.directory}agents/${basename2}`);
  }
  accepts(relativePath) {
    return relativePath.startsWith(this.params.directory);
  }
  acceptsFileName(fileName, allToolSuffixes) {
    const basename2 = fileName.split("/").at(-1) ?? fileName;
    const otherSuffixes = allToolSuffixes.filter((s) => s !== this.params.toolSuffix);
    return !otherSuffixes.some((s) => basename2.endsWith(s));
  }
  convertFrontmatter(fm, fileName) {
    if (this.params.convertFrontmatter) return this.params.convertFrontmatter(fm, fileName);
    const name = agentNameFromFrontmatter(fm, fileName);
    if (this.params.format === "toml") {
      const result = { name, description: fm.description };
      if (fm.model !== void 0) result.model = fm.model;
      return result;
    }
    return { name, description: fm.description };
  }
  reverseConvertFrontmatter(fm) {
    if (this.params.reverseConvertFrontmatter) return this.params.reverseConvertFrontmatter(fm);
    const result = { name: fm.name, description: fm.description };
    if (this.params.format === "toml" && fm.model !== void 0) result.model = fm.model;
    return result;
  }
  serialize(frontmatter, body) {
    if (this.params.format === "toml") {
      return buildTomlContent(frontmatter, body);
    }
    return serializeFrontmatter(frontmatter, body);
  }
  deserialize(content) {
    return parseFrontmatter(content);
  }
  equals(other) {
    return this.params.directory === other.params.directory && this.params.toolSuffix === other.params.toolSuffix && this.params.format === other.params.format && this.params.userFileExt === other.params.userFileExt;
  }
};

// src/domain/tools/registry.ts
var import_node_path = require("path");

// src/domain/errors.ts
var CapabilityConfigError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "CapabilityConfigError";
  }
};
var McpConfigError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "McpConfigError";
  }
};
var UnregisteredToolError = class extends Error {
  constructor(toolId) {
    super(`Tool '${toolId}' is not registered.`);
    this.name = "UnregisteredToolError";
  }
};
var InvalidMcpServerConfigError = class extends Error {
  constructor(name) {
    super(`MCP server "${name}" must have either a "command" or "url" field`);
    this.name = "InvalidMcpServerConfigError";
  }
};
var OpencodeDualConfigError = class extends Error {
  constructor() {
    super("Both opencode.json and opencode.jsonc exist. Remove one.");
    this.name = "OpencodeDualConfigError";
  }
};
var MissingTelemetryEndpointError = class extends Error {
  constructor() {
    super(
      "No OTEL export endpoint given. Telemetry cannot be enabled without one \u2014 there is no default, not even localhost."
    );
    this.name = "MissingTelemetryEndpointError";
  }
};
var UnknownTelemetrySinkSchemaVersionError = class extends Error {
  constructor(version) {
    super(
      `Unknown telemetry sink schema version '${String(version)}' \u2014 refusing to guess its shape.`
    );
    this.name = "UnknownTelemetrySinkSchemaVersionError";
  }
};
var OpencodeExportError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "OpencodeExportError";
  }
};
var InvalidReportDayError = class extends Error {
  constructor(flag, value) {
    super(`Invalid ${flag} '${value}'. Expected a UTC day, as YYYY-MM-DD.`);
    this.name = "InvalidReportDayError";
  }
};
var InvalidReportSpanError = class extends Error {
  constructor(value, maxDays) {
    super(`Invalid --days '${value}'. Expected an integer between 1 and ${maxDays}.`);
    this.name = "InvalidReportSpanError";
  }
};

// src/domain/models/tool-ids.ts
var AI_TOOL_IDS = [
  "claude",
  "cursor",
  "copilot",
  "opencode",
  "codex"
];
var IDE_TOOL_IDS = ["vscode"];
var VALID_TOOL_IDS = [...AI_TOOL_IDS, ...IDE_TOOL_IDS];

// src/domain/tools/registry.ts
function isAiTool(config) {
  return config.kind === "ai";
}
var TOOL_REGISTRY = /* @__PURE__ */ new Map();
function registerTool(config) {
  TOOL_REGISTRY.set(config.toolId, config);
}
function getToolConfig(toolId) {
  const config = TOOL_REGISTRY.get(toolId);
  if (!config) throw new UnregisteredToolError(toolId);
  return config;
}
function getAiToolConfig(toolId) {
  const config = getToolConfig(toolId);
  if (!isAiTool(config)) throw new UnregisteredToolError(toolId);
  return config;
}

// src/domain/capabilities/commands-capability.ts
var ALL_TOOL_SUFFIXES = AI_TOOL_IDS.map((id) => `.${id}.md`);
var CommandsCapability = class {
  constructor(params) {
    this.params = params;
  }
  buildOutputPath(commandName) {
    return `${this.params.directory}commands/${commandName}${this.params.toolSuffix}`;
  }
  buildInstallPath(fileName) {
    return this.params.buildInstallPath(fileName);
  }
  convertFrontmatter(fm, relativeFileName) {
    return this.params.convertFrontmatter(fm, relativeFileName);
  }
  reverseConvertFrontmatter(fm) {
    return this.params.reverseConvertFrontmatter(fm);
  }
  acceptsFileName(fileName) {
    const basename2 = fileName.split("/").at(-1) ?? fileName;
    const otherSuffixes = ALL_TOOL_SUFFIXES.filter((s) => s !== this.params.toolSuffix);
    return !otherSuffixes.some((s) => basename2.endsWith(s));
  }
  serialize(frontmatter, body) {
    return serializeFrontmatter(frontmatter, body);
  }
  accepts(relativePath) {
    return relativePath.startsWith(this.params.directory);
  }
  equals(other) {
    return this.params.directory === other.params.directory && this.params.toolSuffix === other.params.toolSuffix;
  }
};

// src/domain/capabilities/marketplace-entry.ts
function buildDefaultMarketplaceEntry(input) {
  const { name, source, version } = input;
  const value = {};
  if (source.kind === "local") {
    value.source = { source: "directory", path: source.path };
  } else if (source.kind === "github") {
    value.source = { source: "github", repo: source.repo };
  } else {
    return null;
  }
  if (version != null) value.version = version;
  return { valueShape: "map", key: name, value };
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
function parseString(str, ptr) {
  let c = str[ptr++];
  let first = c;
  let isLiteral = c === "'";
  let isMultiline = c === str[ptr] && c === str[ptr + 1];
  if (isMultiline) {
    if (str[ptr += 2] === "\n")
      ptr++;
    else if (str[ptr] === "\r" && str[ptr + 1] === "\n")
      ptr += 2;
  }
  let parsed = "";
  let sliceStart = ptr;
  let state = 0;
  for (let i = ptr; i < str.length; i++) {
    c = str[i];
    if (isMultiline && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      state = state && 3;
    } else if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in strings", {
        toml: str,
        ptr: i
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || str[i + 1] === first && str[i + 2] === first)) {
      if (isMultiline) {
        if (str[i + 3] === first)
          i++;
        if (str[i + 3] === first)
          i++;
      }
      return [
        // If we're in a newline escape still, then there's nothing to add.
        // Also try to avoid concat if there's nothing to add to parsed, or nothing has been added to parsed.
        state ? parsed : parsed + str.slice(sliceStart, i),
        i + (isMultiline ? 3 : 1)
      ];
    } else if (!state) {
      if (!isLiteral && c === "\\") {
        parsed += str.slice(sliceStart, sliceStart = i);
        state = 1;
      }
    } else if (state === 1) {
      if (c === "x" || c === "u" || c === "U") {
        let value = 0;
        let len = c === "x" ? 2 : c === "u" ? 4 : 8;
        for (let j = 0; j < len; j++, i++) {
          let hex = str.charCodeAt(i + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: str, ptr: i + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: str, ptr: i });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = i + 1;
        state = 0;
      } else if (c === " " || c === "	") {
        state = 2;
      } else {
        if (c === "b")
          parsed += "\b";
        else if (c === "t")
          parsed += "	";
        else if (c === "n")
          parsed += "\n";
        else if (c === "f")
          parsed += "\f";
        else if (c === "r")
          parsed += "\r";
        else if (c === "e")
          parsed += "\x1B";
        else if (c === '"')
          parsed += '"';
        else if (c === "\\")
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: str, ptr: i });
        sliceStart = i + 1;
        state = 0;
      }
    } else if (c !== " " && c !== "	") {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: str,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === "\\" ? 1 : 0;
      sliceStart = i;
    }
  }
  throw new TomlError("unfinished string", { toml: str, ptr });
}
function parseValue(value, toml, ptr, integersAsBigInt) {
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", {
        toml,
        ptr
      });
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", {
        toml,
        ptr
      });
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", {
          toml,
          ptr
        });
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid()) {
    throw new TomlError("invalid value", {
      toml,
      ptr
    });
  }
  return date;
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0, end = str.length) {
  let idx = str.indexOf("\n", start);
  if (str[idx - 1] === "\r")
    idx--;
  return idx <= end ? idx : -1;
}
function skipComment(str, ptr) {
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "\n")
      return i;
    if (c === "\r" && str[i + 1] === "\n")
      return i + 1;
    if (c < " " && c !== "	" || c === "\x7F") {
      throw new TomlError("control characters are not allowed in comments", {
        toml: str,
        ptr
      });
    }
  }
  return str.length;
}
function skipVoid(str, ptr, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = str[ptr]) === " " || c === "	" || !banNewLines && (c === "\n" || c === "\r" && str[ptr + 1] === "\n"))
      ptr++;
    if (banComments || c !== "#")
      break;
    ptr = skipComment(str, ptr);
  }
  return ptr;
}
function skipUntil(str, ptr, sep3, end, banNewLines = false) {
  if (!end) {
    ptr = indexOfNewline(str, ptr);
    return ptr < 0 ? str.length : ptr;
  }
  for (let i = ptr; i < str.length; i++) {
    let c = str[i];
    if (c === "#") {
      i = indexOfNewline(str, i);
      if (i < 0)
        break;
    } else if (c === sep3) {
      return i + 1;
    } else if (c === end || banNewLines && (c === "\n" || c === "\r" && str[i + 1] === "\n")) {
      return i;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: str,
    ptr
  });
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/extract.js
function sliceAndTrimEndOf(str, startPtr, endPtr) {
  let value = str.slice(startPtr, endPtr);
  let commentIdx = value.indexOf("#");
  if (commentIdx > -1) {
    skipComment(str, commentIdx);
    value = value.slice(0, commentIdx);
  }
  return [value.trimEnd(), commentIdx];
}
function extractValue(str, ptr, end, depth, integersAsBigInt) {
  if (depth === 0) {
    throw new TomlError("document contains excessively nested structures. aborting.", {
      toml: str,
      ptr
    });
  }
  let c = str[ptr];
  if (c === "[" || c === "{") {
    let [value, endPtr2] = c === "[" ? parseArray(str, ptr, depth, integersAsBigInt) : parseInlineTable(str, ptr, depth, integersAsBigInt);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] === ",")
        endPtr2++;
      else if (str[endPtr2] !== end) {
        throw new TomlError("expected comma or end of structure", {
          toml: str,
          ptr: endPtr2
        });
      }
    }
    return [value, endPtr2];
  }
  if (c === '"' || c === "'") {
    let [parsed, endPtr2] = parseString(str, ptr);
    if (end) {
      endPtr2 = skipVoid(str, endPtr2);
      if (str[endPtr2] && str[endPtr2] !== "," && str[endPtr2] !== end && str[endPtr2] !== "\n" && str[endPtr2] !== "\r") {
        throw new TomlError("unexpected character encountered", {
          toml: str,
          ptr: endPtr2
        });
      }
      if (str[endPtr2] === ",")
        endPtr2++;
    }
    return [parsed, endPtr2];
  }
  let endPtr = skipUntil(str, ptr, ",", end);
  let slice = sliceAndTrimEndOf(str, ptr, endPtr - (str[endPtr - 1] === "," ? 1 : 0));
  if (!slice[0]) {
    throw new TomlError("incomplete key-value declaration: no value specified", {
      toml: str,
      ptr
    });
  }
  if (end && slice[1] > -1) {
    endPtr = skipVoid(str, ptr + slice[1]);
    if (str[endPtr] === ",")
      endPtr++;
  }
  return [
    parseValue(slice[0], str, ptr, integersAsBigInt),
    endPtr
  ];
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(str, ptr, end = "=") {
  let dot = ptr - 1;
  let parsed = [];
  let endPtr = str.indexOf(end, ptr);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: str,
      ptr
    });
  }
  do {
    let c = str[ptr = ++dot];
    if (c !== " " && c !== "	") {
      if (c === '"' || c === "'") {
        if (c === str[ptr + 1] && c === str[ptr + 2]) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: str,
            ptr
          });
        }
        let [part, eos] = parseString(str, ptr);
        dot = str.indexOf(".", eos);
        let strEnd = str.slice(eos, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: str,
            ptr: ptr + dot + newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: str,
            ptr: eos
          });
        }
        if (endPtr < eos) {
          endPtr = str.indexOf(end, eos);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: str,
              ptr
            });
          }
        }
        parsed.push(part);
      } else {
        dot = str.indexOf(".", ptr);
        let part = str.slice(ptr, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: str,
            ptr
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  return [parsed, skipVoid(str, endPtr + 1, true, true)];
}
function parseInlineTable(str, ptr, depth, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "}" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let k;
      let t = res;
      let hasOwn = false;
      let [key, keyEndPtr] = parseKey(str, ptr - 1);
      for (let i = 0; i < key.length; i++) {
        if (i)
          t = hasOwn ? t[k] : t[k] = {};
        k = key[i];
        if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
          throw new TomlError("trying to redefine an already defined value", {
            toml: str,
            ptr
          });
        }
        if (!hasOwn && k === "__proto__") {
          Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        }
      }
      if (hasOwn) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: str,
          ptr
        });
      }
      let [value, valueEndPtr] = extractValue(str, keyEndPtr, "}", depth - 1, integersAsBigInt);
      seen.add(value);
      t[k] = value;
      ptr = valueEndPtr;
    }
  }
  if (!c) {
    throw new TomlError("unfinished table encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}
function parseArray(str, ptr, depth, integersAsBigInt) {
  let res = [];
  let c;
  ptr++;
  while ((c = str[ptr++]) !== "]" && c) {
    if (c === ",") {
      throw new TomlError("expected value, found comma", {
        toml: str,
        ptr: ptr - 1
      });
    } else if (c === "#")
      ptr = skipComment(str, ptr);
    else if (c !== " " && c !== "	" && c !== "\n" && c !== "\r") {
      let e = extractValue(str, ptr - 1, "]", depth - 1, integersAsBigInt);
      res.push(e[0]);
      ptr = e[1];
    }
  }
  if (!c) {
    throw new TomlError("unfinished array encountered", {
      toml: str,
      ptr
    });
  }
  return [res, ptr];
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let res = {};
  let meta = {};
  let tbl = res;
  let m = meta;
  for (let ptr = skipVoid(toml, 0); ptr < toml.length; ) {
    if (toml[ptr] === "[") {
      let isTableArray = toml[++ptr] === "[";
      let k = parseKey(toml, ptr += +isTableArray, "]");
      if (isTableArray) {
        if (toml[k[1] - 1] !== "]") {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: k[1] - 1
          });
        }
        k[1]++;
      }
      let p = peekTable(
        k[0],
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      m = p[2];
      tbl = p[1];
      ptr = k[1];
    } else {
      let k = parseKey(toml, ptr);
      let p = peekTable(
        k[0],
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr
        });
      }
      let v = extractValue(toml, k[1], void 0, maxDepth, integersAsBigInt);
      p[1][p[0]] = v[0];
      ptr = v[1];
    }
    ptr = skipVoid(toml, ptr, true);
    if (toml[ptr] && toml[ptr] !== "\n" && toml[ptr] !== "\r") {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr
      });
    }
    ptr = skipVoid(toml, ptr);
  }
  return res;
}

// node_modules/.pnpm/smol-toml@1.7.1/node_modules/smol-toml/dist/stringify.js
var BARE_KEY = /^[a-z0-9-_]+$/i;
function extendedTypeOf(obj) {
  let type = typeof obj;
  if (type === "object") {
    if (Array.isArray(obj))
      return "array";
    if (obj instanceof Date)
      return "date";
  }
  return type;
}
function isArrayOfTables(obj) {
  for (let i = 0; i < obj.length; i++) {
    if (extendedTypeOf(obj[i]) !== "object")
      return false;
  }
  return obj.length != 0;
}
function formatString(s) {
  return JSON.stringify(s).replace(/\x7f/g, "\\u007f");
}
function stringifyValue(val, type, depth, numberAsFloat) {
  if (depth === 0) {
    throw new Error("Could not stringify the object: maximum object depth exceeded");
  }
  if (type === "number") {
    if (isNaN(val))
      return "nan";
    if (val === Infinity)
      return "inf";
    if (val === -Infinity)
      return "-inf";
    if (Number.isInteger(val) && (numberAsFloat || !Number.isSafeInteger(val)))
      return val.toFixed(1);
    return val.toString();
  }
  if (type === "bigint" || type === "boolean") {
    return val.toString();
  }
  if (type === "string") {
    return formatString(val);
  }
  if (type === "date") {
    if (isNaN(val.getTime())) {
      throw new TypeError("cannot serialize invalid date");
    }
    return val.toISOString();
  }
  if (type === "object") {
    return stringifyInlineTable(val, depth, numberAsFloat);
  }
  if (type === "array") {
    return stringifyArray(val, depth, numberAsFloat);
  }
}
function stringifyInlineTable(obj, depth, numberAsFloat) {
  let keys = Object.keys(obj);
  if (keys.length === 0)
    return "{}";
  let res = "{ ";
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i];
    if (i)
      res += ", ";
    res += BARE_KEY.test(k) ? k : formatString(k);
    res += " = ";
    res += stringifyValue(obj[k], extendedTypeOf(obj[k]), depth - 1, numberAsFloat);
  }
  return res + " }";
}
function stringifyArray(array, depth, numberAsFloat) {
  if (array.length === 0)
    return "[]";
  let res = "[ ";
  for (let i = 0; i < array.length; i++) {
    if (i)
      res += ", ";
    if (array[i] === null || array[i] === void 0) {
      throw new TypeError("arrays cannot contain null or undefined values");
    }
    res += stringifyValue(array[i], extendedTypeOf(array[i]), depth - 1, numberAsFloat);
  }
  return res + " ]";
}
function stringifyArrayTable(array, key, depth, numberAsFloat) {
  if (depth === 0) {
    throw new Error("Could not stringify the object: maximum object depth exceeded");
  }
  let res = "";
  for (let i = 0; i < array.length; i++) {
    res += `${res && "\n"}[[${key}]]
`;
    res += stringifyTable(0, array[i], key, depth, numberAsFloat);
  }
  return res;
}
function stringifyTable(tableKey, obj, prefix, depth, numberAsFloat) {
  if (depth === 0) {
    throw new Error("Could not stringify the object: maximum object depth exceeded");
  }
  let preamble = "";
  let tables = "";
  let keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i];
    if (obj[k] !== null && obj[k] !== void 0) {
      let type = extendedTypeOf(obj[k]);
      if (type === "symbol" || type === "function") {
        throw new TypeError(`cannot serialize values of type '${type}'`);
      }
      let key = BARE_KEY.test(k) ? k : formatString(k);
      if (type === "array" && isArrayOfTables(obj[k])) {
        tables += (tables && "\n") + stringifyArrayTable(obj[k], prefix ? `${prefix}.${key}` : key, depth - 1, numberAsFloat);
      } else if (type === "object") {
        let tblKey = prefix ? `${prefix}.${key}` : key;
        tables += (tables && "\n") + stringifyTable(tblKey, obj[k], tblKey, depth - 1, numberAsFloat);
      } else {
        preamble += key;
        preamble += " = ";
        preamble += stringifyValue(obj[k], type, depth, numberAsFloat);
        preamble += "\n";
      }
    }
  }
  if (tableKey && (preamble || !tables))
    preamble = preamble ? `[${tableKey}]
${preamble}` : `[${tableKey}]`;
  return preamble && tables ? `${preamble}
${tables}` : preamble || tables;
}
function stringify(obj, { maxDepth = 1e3, numbersAsFloat = false } = {}) {
  if (extendedTypeOf(obj) !== "object") {
    throw new TypeError("stringify can only be called with an object");
  }
  let str = stringifyTable(0, obj, "", maxDepth, numbersAsFloat);
  if (str[str.length - 1] !== "\n")
    return str + "\n";
  return str;
}

// src/domain/formats/mcp-format.ts
var UNIVERSAL_FIELDS = [
  "startup_timeout_sec",
  "tool_timeout_sec",
  "enabled",
  "required",
  "enabled_tools",
  "disabled_tools"
];
function buildStdioTomlEntry(raw) {
  const entry = { command: raw.command };
  if (raw.args !== void 0) entry.args = raw.args;
  if (raw.env !== void 0) entry.env = raw.env;
  if (raw.cwd !== void 0) entry.cwd = raw.cwd;
  for (const field of UNIVERSAL_FIELDS) {
    if (raw[field] !== void 0) entry[field] = raw[field];
  }
  return entry;
}
function buildHttpTomlEntry(raw) {
  const entry = { url: raw.url };
  if (raw.bearerTokenEnvVar !== void 0) entry.bearer_token_env_var = raw.bearerTokenEnvVar;
  if (raw.http_headers !== void 0) entry.http_headers = raw.http_headers;
  if (raw.env_http_headers !== void 0) entry.env_http_headers = raw.env_http_headers;
  for (const field of UNIVERSAL_FIELDS) {
    if (raw[field] !== void 0) entry[field] = raw[field];
  }
  return entry;
}
function mapServerToToml(raw) {
  if ("command" in raw) return buildStdioTomlEntry(raw);
  if ("url" in raw) return buildHttpTomlEntry(raw);
  return {};
}
function mcpJsonToToml(json) {
  const parsed = JSON.parse(json);
  const servers = parsed.mcpServers ?? {};
  if (Object.keys(servers).length === 0) return "";
  const mcp_servers = {};
  for (const [name, raw] of Object.entries(servers)) {
    mcp_servers[name] = mapServerToToml(raw);
  }
  return stringify({ mcp_servers });
}
function mergeJsonUserPrime(existing, incoming) {
  const existingObj = existing.trim() ? JSON.parse(existing) : {};
  const incomingObj = JSON.parse(incoming);
  return JSON.stringify(deepMerge(incomingObj, existingObj), null, 2);
}
function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = result[key];
    if (isPlainObject(value) && isPlainObject(existing)) {
      result[key] = deepMerge(
        existing,
        value
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// src/domain/capabilities/mcp-capability.ts
var McpCapability = class {
  constructor(params) {
    this.params = params;
    this.consumes = params.consumes ?? [];
  }
  consumes;
  transform(mcpJson) {
    const afterTransform = this.params.transformContent ? this.params.transformContent(mcpJson) : mcpJson;
    if (this.params.format === "toml") {
      return mcpJsonToToml(afterTransform);
    }
    return afterTransform;
  }
  async resolveOutput(projectRoot, fs) {
    if (this.params.resolveOutputPath) {
      return this.params.resolveOutputPath(projectRoot, fs);
    }
    return this.params.outputPath;
  }
  merge(existing, incoming) {
    if (this.params.mergeFn !== void 0) {
      return this.params.mergeFn(existing, incoming);
    }
    if (this.params.mergeStrategy === "none") {
      return incoming;
    }
    return mergeJsonUserPrime(existing, incoming);
  }
  accepts(relativePath) {
    return relativePath === this.params.outputPath;
  }
  equals(other) {
    return this.params.outputPath === other.params.outputPath && this.params.format === other.params.format && this.params.entrySection === other.params.entrySection && this.params.mergeStrategy === other.params.mergeStrategy;
  }
};

// src/domain/capabilities/plugins-capability.ts
var DEFAULT_MCP_PATH = ".mcp.json";
var DEFAULT_HOOKS_PATH = "hooks/hooks.json";
var DEFAULT_HOOKS_FORMAT = "claude";
var PluginsCapability = class _PluginsCapability {
  mode;
  pluginsDir;
  pluginManifestRelativePath;
  flatNamespacePrefix;
  acceptsHooks;
  acceptsMcp;
  mcpRelativePath;
  hooksRelativePath;
  hooksContentFormat;
  marketplaceSettings;
  /** Native CLI-driven plugin activation declaration, or `null` when not applicable. */
  nativeActivation;
  /**
   * Explicit declaration of the plugin translation strategy for this capability.
   * - `"marketplace"`: Mode A — register plugin reference in the tool's native config (no file materialization).
   * - `"flat"`: Mode B — materialize plugin content as files on disk.
   * - `null`: no translation strategy applies (neutral native or unsupported).
   *
   * Set explicitly via `NativePluginsParams.translationMode` for native tools that use Mode A.
   * Flat mode always resolves to `"flat"` automatically; unsupported always resolves to `null`.
   */
  translationMode;
  /**
   * Scope for plugin installation.
   * - `"project"` (default): plugins are installed relative to the project root.
   * - `"user"`: plugins are installed relative to the user home directory via `resolvePluginsBaseDir`.
   */
  installScope;
  _userPluginsDir;
  constructor(params) {
    this.mode = params.mode;
    this.translationMode = _PluginsCapability.resolveTranslationMode(params);
    this.installScope = _PluginsCapability.resolveInstallScope(params);
    _PluginsCapability.validateUserScope(params);
    if (params.mode === "native") {
      this.pluginsDir = params.pluginsDir;
      this.pluginManifestRelativePath = params.pluginManifestRelativePath;
      this.flatNamespacePrefix = null;
      this.acceptsHooks = params.acceptsHooks ?? false;
      this.acceptsMcp = params.acceptsMcp ?? false;
      this.mcpRelativePath = params.mcpRelativePath ?? DEFAULT_MCP_PATH;
      this.hooksRelativePath = params.hooksRelativePath ?? DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = params.hooksContentFormat ?? DEFAULT_HOOKS_FORMAT;
      this.marketplaceSettings = params.marketplaceSettings ?? null;
      this.nativeActivation = params.nativeActivation ?? null;
      this._userPluginsDir = params.userPluginsDir;
    } else {
      this.pluginsDir = null;
      this.pluginManifestRelativePath = null;
      this.flatNamespacePrefix = params.mode === "flat" ? params.flatNamespacePrefix : null;
      this.acceptsHooks = false;
      this.acceptsMcp = false;
      this.mcpRelativePath = DEFAULT_MCP_PATH;
      this.hooksRelativePath = DEFAULT_HOOKS_PATH;
      this.hooksContentFormat = DEFAULT_HOOKS_FORMAT;
      this.marketplaceSettings = null;
      this.nativeActivation = null;
      this._userPluginsDir = void 0;
    }
  }
  /**
   * Resolves the absolute base directory for plugin file writes.
   * - For `installScope === "project"`: returns `projectRoot`.
   * - For `installScope === "user"`: returns the user-scope plugins dir resolved from `homedir`.
   */
  resolvePluginsBaseDir(projectRoot, homedir3) {
    if (this.installScope === "user" && this._userPluginsDir !== void 0) {
      return this._userPluginsDir(homedir3);
    }
    return projectRoot;
  }
  pluginOutputDir(pluginName) {
    if (this.mode !== "native" || this.pluginsDir === null) return null;
    return `${this.pluginsDir}${pluginName}/`;
  }
  static resolveTranslationMode(params) {
    if (params.mode === "native") return params.translationMode ?? null;
    if (params.mode === "flat") return "flat";
    return null;
  }
  static resolveInstallScope(params) {
    if (params.mode === "native") return params.installScope ?? "project";
    return "project";
  }
  static validateUserScope(params) {
    if (params.mode !== "native") return;
    if (params.installScope === "user" && params.userPluginsDir === void 0) {
      throw new CapabilityConfigError(
        "installScope 'user' requires a userPluginsDir resolver function."
      );
    }
  }
};

// src/domain/capabilities/rules-capability.ts
var ALL_TOOL_SUFFIXES2 = AI_TOOL_IDS.map((id) => `.${id}.md`);
var RulesCapability = class {
  constructor(params) {
    this.params = params;
  }
  buildOutputPath(ruleName) {
    return `${this.params.directory}rules/${ruleName}${this.params.toolSuffix}`;
  }
  buildInstallPath(fileName) {
    return this.params.buildInstallPath(fileName);
  }
  convertFrontmatter(fm) {
    return this.params.convertFrontmatter(fm);
  }
  reverseConvertFrontmatter(fm) {
    return this.params.reverseConvertFrontmatter(fm);
  }
  acceptsFileName(fileName) {
    const basename2 = fileName.split("/").at(-1) ?? fileName;
    const effectiveSuffix = this.params.inputSuffix ?? this.params.toolSuffix;
    const otherSuffixes = ALL_TOOL_SUFFIXES2.filter((s) => s !== effectiveSuffix);
    return !otherSuffixes.some((s) => basename2.endsWith(s));
  }
  serialize(frontmatter, body) {
    return serializeFrontmatter(frontmatter, body);
  }
  accepts(relativePath) {
    return relativePath.startsWith(this.params.directory);
  }
  equals(other) {
    return this.params.directory === other.params.directory && this.params.toolSuffix === other.params.toolSuffix;
  }
};

// src/domain/capabilities/skills-capability.ts
var AGENTS_SKILLS_PREFIX = ".agents/skills/";
var ALL_TOOL_SUFFIXES3 = AI_TOOL_IDS.map((id) => `.${id}.md`);
var SkillsCapability = class {
  constructor(params) {
    this.params = params;
    if (!params.prefix && !params.directory) {
      throw new CapabilityConfigError("SkillsCapability requires either prefix or directory");
    }
  }
  buildOutputPath(skillName) {
    if (this.params.prefix !== void 0) {
      return `${AGENTS_SKILLS_PREFIX}${this.params.prefix}${skillName}/SKILL.md`;
    }
    return `${this.params.directory}skills/${skillName}${this.params.toolSuffix ?? ""}`;
  }
  buildInstallPath(fileName) {
    return this.params.buildInstallPath(fileName);
  }
  convertFrontmatter(fm) {
    return this.params.convertFrontmatter(fm);
  }
  reverseConvertFrontmatter(fm) {
    return this.params.reverseConvertFrontmatter(fm);
  }
  acceptsFileName(fileName) {
    const basename2 = fileName.split("/").at(-1) ?? fileName;
    const toolSuffix = this.params.toolSuffix ?? "";
    const otherSuffixes = ALL_TOOL_SUFFIXES3.filter((s) => s !== toolSuffix);
    return !otherSuffixes.some((s) => basename2.endsWith(s));
  }
  serialize(frontmatter, body) {
    return serializeFrontmatter(frontmatter, body);
  }
  accepts(relativePath) {
    if (this.params.prefix !== void 0) {
      return relativePath.startsWith(AGENTS_SKILLS_PREFIX);
    }
    return relativePath.startsWith(this.params.directory ?? "");
  }
  equals(other) {
    return this.params.directory === other.params.directory && this.params.toolSuffix === other.params.toolSuffix && this.params.prefix === other.params.prefix;
  }
};

// src/domain/formats/claude-code-transcript.ts
var import_node_path2 = require("path");
var VENDOR_FIELD = "sessionId";
var TURN_FIELD = "requestId";
function asNumber(value) {
  return typeof value === "number" ? value : void 0;
}
function asString(value) {
  return typeof value === "string" ? value : void 0;
}
function readCounters(usage) {
  const input = asNumber(usage?.input_tokens);
  const cacheCreation = asNumber(usage?.cache_creation_input_tokens);
  const cacheRead = asNumber(usage?.cache_read_input_tokens);
  const output = asNumber(usage?.output_tokens);
  if (input === void 0 || cacheCreation === void 0) return null;
  if (cacheRead === void 0 || output === void 0) return null;
  return {
    input_tokens: input,
    cache_creation_input_tokens: cacheCreation,
    cache_read_input_tokens: cacheRead,
    output_tokens: output
  };
}
function buildIdentity(line, vendorId) {
  const turnId = asString(line.requestId);
  return {
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD,
    ...turnId !== void 0 ? { turn_id: turnId, turn_field: TURN_FIELD } : {}
  };
}
function buildOptionalFields(line) {
  const model = asString(line.message?.model);
  const effort = asString(line.effort);
  const timestamp = asString(line.timestamp);
  const agentName = line.isSidechain === true ? asString(line.attributionAgent) : void 0;
  const step = asString(line.attributionSkill);
  const stepPlugin = step !== void 0 ? asString(line.attributionPlugin) : void 0;
  return {
    ...model !== void 0 ? { model } : {},
    ...effort !== void 0 ? { effort } : {},
    ...timestamp !== void 0 ? { event_timestamp: timestamp } : {},
    ...agentName !== void 0 ? { agent_name: agentName } : {},
    ...step !== void 0 ? { step } : {},
    ...stepPlugin !== void 0 ? { step_plugin: stepPlugin } : {}
  };
}
function buildRecord(line, vendorId, counters) {
  return {
    kind: "request",
    ...buildIdentity(line, vendorId),
    ...buildOptionalFields(line),
    input_tokens: counters.input_tokens,
    output_tokens: counters.output_tokens,
    cache_read_tokens: counters.cache_read_input_tokens,
    cache_creation_tokens: counters.cache_creation_input_tokens
  };
}
function parseAssistantLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (parsed.type !== "assistant") return null;
  const vendorId = asString(parsed.sessionId);
  if (vendorId === void 0) return null;
  const counters = readCounters(parsed.message?.usage);
  if (!counters) return null;
  const dedupeKey = asString(parsed.message?.id) ?? asString(parsed.requestId) ?? trimmed;
  return { dedupeKey, record: buildRecord(parsed, vendorId, counters) };
}
var ClaudeCodeTranscriptAccumulator = class {
  seen = /* @__PURE__ */ new Set();
  records = [];
  push(line) {
    const parsed = parseAssistantLine(line);
    if (!parsed || this.seen.has(parsed.dedupeKey)) return;
    this.seen.add(parsed.dedupeKey);
    this.records.push(parsed.record);
  }
  build() {
    return this.records;
  }
};
function createClaudeCodeTranscriptAccumulator() {
  return new ClaudeCodeTranscriptAccumulator();
}
function matchesMainTranscript(segments, sessionId) {
  return segments.length === 2 && segments[1] === `${sessionId}.jsonl`;
}
function matchesSubagentTranscript(segments, sessionId) {
  return segments.length === 4 && segments[1] === sessionId && segments[2] === "subagents" && segments[3].endsWith(".jsonl");
}
var CLAUDE_CODE_TRANSCRIPT_LOCATION = {
  root: (homeDir) => `${homeDir}${import_node_path2.sep}.claude${import_node_path2.sep}projects`,
  matches: (relativePath, sessionId) => {
    const segments = relativePath.split(import_node_path2.sep);
    return matchesMainTranscript(segments, sessionId) || matchesSubagentTranscript(segments, sessionId);
  }
};

// src/domain/formats/command.ts
function stripToolSuffix(suffix, fileName) {
  const basename2 = fileName.split("/").at(-1) ?? fileName;
  if (!basename2.endsWith(suffix)) return fileName;
  const dir = fileName.slice(0, fileName.length - basename2.length);
  const stripped = `${basename2.slice(0, -suffix.length)}.md`;
  return `${dir}${stripped}`;
}
function buildCommandName(fm, relativeFileName) {
  const phase = relativeFileName.split("/")[0]?.match(/^(\d+)/)?.[1];
  const baseName = String(fm.name ?? "");
  return phase ? `aidd:${phase}:${baseName}` : baseName;
}
function stripCommandNamePrefix(fm) {
  const rawName = String(fm.name ?? "");
  const match = /^aidd:\d+:(.+)$/.exec(rawName);
  return match ? match[1] : rawName;
}
function convertCommandFrontmatter(fm, relativeFileName) {
  const name = buildCommandName(fm, relativeFileName);
  const result = { name, description: fm.description };
  if (fm["argument-hint"] !== void 0) result["argument-hint"] = fm["argument-hint"];
  return result;
}
function convertCommandFrontmatterNoHint(fm, relativeFileName) {
  const name = buildCommandName(fm, relativeFileName);
  return { name, description: fm.description };
}
function reverseConvertCommandFrontmatter(fm) {
  const name = stripCommandNamePrefix(fm);
  const result = { name, description: fm.description };
  if (fm["argument-hint"] !== void 0) result["argument-hint"] = fm["argument-hint"];
  return result;
}
function reverseConvertCommandFrontmatterNoHint(fm) {
  const name = stripCommandNamePrefix(fm);
  return { name, description: fm.description };
}
function buildAiddCommandFilePath(dir, fileName) {
  const slashIdx = fileName.indexOf("/");
  if (slashIdx !== -1) {
    const phaseDir = fileName.slice(0, slashIdx);
    const baseName2 = fileName.slice(slashIdx + 1);
    const phase = phaseDir.match(/^(\d+)/)?.[1];
    if (phase) {
      return `${dir}commands/aidd/${phase}/${baseName2}`;
    }
  }
  const baseName = fileName.split("/").at(-1) ?? fileName;
  return `${dir}commands/aidd/${baseName}`;
}
function detectSectionKeyFromPrefixes(relativePath, prefixes) {
  for (const [prefix, section] of prefixes) {
    if (relativePath.startsWith(prefix)) return { section, key: relativePath.slice(prefix.length) };
  }
  return null;
}

// src/domain/formats/placeholders.ts
function baseRewriteContent(content, _directory, _docsDir) {
  return content;
}
function baseReverseRewriteContent(content, _directory, _docsDir) {
  return content;
}

// src/domain/models/framework.ts
var TOOLS_PLACEHOLDER = "{{TOOLS}}/";
var DOCS_PLACEHOLDER = "{{DOCS}}/";
var AT_TOOLS_PLACEHOLDER = "@{{TOOLS}}/";
var AT_DOCS_PLACEHOLDER = "@{{DOCS}}/";
var CONFIG_MCP = "mcp";
var CONFIG_OPENCODE = "opencode";
var GITKEEP_FILE = ".gitkeep";

// src/domain/tools/ai/claude-telemetry.ts
var import_node_path3 = require("path");
var CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE = "session.id";
var CLAUDE_TELEMETRY_TURN_ATTRIBUTE = "prompt.id";
var CLAUDE_TELEMETRY_SESSION_MEASURES = [
  { metric: "claude_code.cost.usage", field: "cost_usd" },
  { metric: "claude_code.active_time.total", field: "active_time_s" },
  {
    metric: "claude_code.token.usage",
    field: "input_tokens",
    whenAttribute: "type",
    whenValue: "input"
  },
  {
    metric: "claude_code.token.usage",
    field: "output_tokens",
    whenAttribute: "type",
    whenValue: "output"
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_read_tokens",
    whenAttribute: "type",
    whenValue: "cacheRead"
  },
  {
    metric: "claude_code.token.usage",
    field: "cache_creation_tokens",
    whenAttribute: "type",
    whenValue: "cacheCreation"
  }
];
var TELEMETRY_METRIC_EXPORT_INTERVAL_MS = "10000";
var CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH = {
  local: ".claude/settings.local.json",
  project: ".claude/settings.json"
};
var CLAUDE_TELEMETRY_POST_ENABLE_NOTICE = "Per-step cost is unavailable until #663 lands. OTEL_LOG_TOOL_DETAILS is not set \u2014 no Bash command, MCP tool name, or tool input is logged.";
function buildClaudeTelemetryEnv(endpoint, projectId) {
  const trimmedEndpoint = endpoint?.trim();
  if (!trimmedEndpoint) throw new MissingTelemetryEndpointError();
  return {
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_EXPORTER: "otlp",
    OTEL_LOGS_EXPORTER: "otlp",
    OTEL_EXPORTER_OTLP_PROTOCOL: "http/json",
    OTEL_EXPORTER_OTLP_ENDPOINT: trimmedEndpoint,
    OTEL_METRIC_EXPORT_INTERVAL: TELEMETRY_METRIC_EXPORT_INTERVAL_MS,
    OTEL_RESOURCE_ATTRIBUTES: `aidd.project_id=${projectId}`
  };
}
function resolveClaudeTelemetrySettingsPath(scope, projectRoot, homeDir) {
  if (scope === "user") return (0, import_node_path3.join)(homeDir, ".claude", "settings.json");
  return (0, import_node_path3.join)(projectRoot, CLAUDE_PROJECT_RELATIVE_SETTINGS_PATH[scope]);
}

// src/domain/tools/ai/claude.ts
var DIRECTORY = ".claude/";
var TOOL_SUFFIX = ".claude.md";
function commandsDir(phase) {
  return `${DIRECTORY}commands/aidd/${phase}/`;
}
var claude = {
  kind: "ai",
  toolId: "claude",
  displayName: "Claude Code",
  directory: DIRECTORY,
  toolSuffix: TOOL_SUFFIX,
  signalDir: ".claude/commands",
  configOutputPaths: { "settings.json": ".claude/settings.json" },
  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      format: "markdown"
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => `${DIRECTORY}skills/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => {
        const slashIdx = fileName.indexOf("/");
        if (slashIdx !== -1) {
          const phaseDir = fileName.slice(0, slashIdx);
          const rest = fileName.slice(slashIdx + 1);
          const phase = phaseDir.match(/^(\d+)/)?.[1];
          if (phase) return `${commandsDir(phase)}${rest}`;
        }
        return `${DIRECTORY}commands/${stripToolSuffix(TOOL_SUFFIX, fileName)}`;
      },
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm)
    }),
    rules: new RulesCapability({
      directory: DIRECTORY,
      toolSuffix: TOOL_SUFFIX,
      buildInstallPath: (fileName) => `${DIRECTORY}rules/${stripToolSuffix(TOOL_SUFFIX, fileName)}`,
      convertFrontmatter: (fm) => {
        if ("paths" in fm) {
          const paths = fm.paths;
          if (Array.isArray(paths) && paths.length === 0) return {};
          return { paths };
        }
        if ("globs" in fm) return { paths: fm.globs };
        if ("alwaysApply" in fm) {
          if (fm.alwaysApply === false && fm.description !== void 0) {
            return { description: fm.description };
          }
          return {};
        }
        return {};
      },
      reverseConvertFrontmatter: (fm) => Array.isArray(fm.paths) && fm.paths.length > 0 ? { paths: fm.paths } : {}
    }),
    mcp: new McpCapability({
      outputPath: ".mcp.json",
      format: "json",
      entrySection: "mcpServers",
      consumes: [CONFIG_MCP]
    }),
    plugins: new PluginsCapability({
      mode: "native",
      pluginsDir: ".claude/plugins/",
      pluginManifestRelativePath: "plugin.json",
      acceptsHooks: true,
      acceptsMcp: true,
      translationMode: "marketplace",
      marketplaceSettings: {
        settingsPath: ".claude/settings.json",
        settingsKey: "extraKnownMarketplaces",
        enabledPluginsKey: "enabledPlugins",
        toEntry: buildDefaultMarketplaceEntry
      }
    })
  },
  telemetry: {
    kind: "settings-file",
    sectionKey: "env",
    mergeStrategy: "framework-prime",
    scopes: ["local", "project", "user"],
    defaultScope: "local",
    // .claude/settings.json is git-tracked — writing there turns telemetry on for
    // everyone who clones. .local.json and the home-dir file are not.
    trackedScopes: ["project"],
    resolveSettingsPath: resolveClaudeTelemetrySettingsPath,
    buildEnv: buildClaudeTelemetryEnv,
    postEnableNotice: CLAUDE_TELEMETRY_POST_ENABLE_NOTICE
  },
  telemetryExport: {
    kind: "declared",
    identityAttribute: CLAUDE_TELEMETRY_IDENTITY_ATTRIBUTE,
    turnAttribute: CLAUDE_TELEMETRY_TURN_ATTRIBUTE,
    sessionMeasures: CLAUDE_TELEMETRY_SESSION_MEASURES,
    // The only route on any tool that has ever carried an amount. Its own skill
    // attribute reads `third-party` for every framework skill, so nothing here states a
    // step - which is the whole reason the run journal exists.
    supplies: { tokenCounters: true, amount: true, toolStatedStep: false }
  },
  // Measured 2026-08-20: an assistant message in ~/.claude/projects/*/*.jsonl carries
  // `message.usage`'s four counters and `message.model`, keyed on `requestId`. See
  // claude-code-transcript.ts for the full measurement and its two captured fixtures.
  telemetryLocalRead: {
    kind: "declared",
    transcript: CLAUDE_CODE_TRANSCRIPT_LOCATION,
    // The mirror image of the export: the transcript names the running skill exactly, on
    // the same line as the counters, and carries no amount at all.
    supplies: { tokenCounters: true, amount: false, toolStatedStep: true }
  },
  telemetryTaskAttributable: true,
  telemetryJournalHost: "claude-code",
  rewriteContent(content, docsDir) {
    return baseRewriteContent(content, DIRECTORY, docsDir).replace(
      /(@?)\.claude\/commands\/(\d+)[_][^/]+\//g,
      (_, at, phase) => `${at}${commandsDir(phase)}`
    );
  },
  reverseRewriteContent(content, docsDir) {
    return baseReverseRewriteContent(content, DIRECTORY, docsDir);
  },
  detectUserFileSectionKey(relativePath) {
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${DIRECTORY}agents/`, "agents"],
      [`${DIRECTORY}commands/aidd/`, "commands"],
      [`${DIRECTORY}rules/`, "rules"],
      [`${DIRECTORY}skills/`, "skills"]
    ]);
  }
};
registerTool(claude);

// src/domain/capabilities/hooks-capability.ts
var HooksCapability = class {
  constructor(params) {
    this.params = params;
    this.consumes = params.consumes ?? [];
  }
  consumes;
  buildOutputPath() {
    return this.params.outputPath;
  }
  merge(existing, incoming) {
    if (this.params.mergeFn !== void 0) {
      return this.params.mergeFn(existing, incoming);
    }
    return incoming;
  }
  getMergeStrategy() {
    return this.params.mergeStrategy ?? "user-prime";
  }
  getEntrySection() {
    return this.params.entrySection ?? null;
  }
  accepts(relativePath) {
    return relativePath === this.params.outputPath;
  }
  equals(other) {
    return this.params.outputPath === other.params.outputPath && this.params.mergeStrategy === other.params.mergeStrategy && this.params.entrySection === other.params.entrySection;
  }
};

// src/domain/formats/codex-rollout.ts
var import_node_path4 = require("path");
var VENDOR_FIELD2 = "session_meta.id";
var TURN_FIELD2 = "turn_id";
function asNumber2(value) {
  return typeof value === "number" ? value : void 0;
}
function asString2(value) {
  return typeof value === "string" ? value : void 0;
}
function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
function startTurn(payload, at) {
  const turnId = asString2(payload.turn_id);
  if (turnId === void 0) return null;
  return { turnId, model: asString2(payload.model), effort: asString2(payload.effort), at };
}
function addUsage(pending, usage) {
  const rawInput = asNumber2(usage.input_tokens);
  const cached = asNumber2(usage.cached_input_tokens);
  const cacheWrite = asNumber2(usage.cache_write_input_tokens);
  const output = asNumber2(usage.output_tokens);
  if (rawInput !== void 0) {
    pending.inputTokens = (pending.inputTokens ?? 0) + (rawInput - (cached ?? 0));
  }
  if (cached !== void 0) pending.cacheReadTokens = (pending.cacheReadTokens ?? 0) + cached;
  if (cacheWrite !== void 0) {
    pending.cacheCreationTokens = (pending.cacheCreationTokens ?? 0) + cacheWrite;
  }
  if (output !== void 0) pending.outputTokens = (pending.outputTokens ?? 0) + output;
}
function hasCounters(pending) {
  return pending.inputTokens !== void 0 || pending.outputTokens !== void 0 || pending.cacheReadTokens !== void 0 || pending.cacheCreationTokens !== void 0;
}
function buildRecord2(vendorId, pending) {
  return {
    kind: "request",
    vendor_id: vendorId,
    vendor_field: VENDOR_FIELD2,
    turn_id: pending.turnId,
    turn_field: TURN_FIELD2,
    ...pending.model !== void 0 ? { model: pending.model } : {},
    ...pending.effort !== void 0 ? { effort: pending.effort } : {},
    ...pending.at !== void 0 ? { event_timestamp: pending.at } : {},
    ...pending.inputTokens !== void 0 ? { input_tokens: pending.inputTokens } : {},
    ...pending.outputTokens !== void 0 ? { output_tokens: pending.outputTokens } : {},
    ...pending.cacheReadTokens !== void 0 ? { cache_read_tokens: pending.cacheReadTokens } : {},
    ...pending.cacheCreationTokens !== void 0 ? { cache_creation_tokens: pending.cacheCreationTokens } : {}
  };
}
var CodexRolloutAccumulator = class {
  vendorId;
  pending;
  records = [];
  push(line) {
    const parsed = parseLine(line);
    if (!parsed?.payload) return;
    if (parsed.type === "session_meta") this.vendorId = asString2(parsed.payload.id);
    else if (parsed.type === "turn_context") this.startNewTurn(parsed.payload, parsed.timestamp);
    else if (parsed.type === "event_msg" && parsed.payload.type === "token_count") {
      this.applyTokenCount(parsed.payload.info?.last_token_usage);
    }
  }
  build() {
    this.flush();
    return this.records;
  }
  startNewTurn(payload, timestamp) {
    this.flush();
    this.pending = startTurn(payload, asString2(timestamp)) ?? void 0;
  }
  applyTokenCount(usage) {
    if (!this.pending || !usage) return;
    addUsage(this.pending, usage);
  }
  flush() {
    if (this.pending && this.vendorId !== void 0 && hasCounters(this.pending)) {
      this.records.push(buildRecord2(this.vendorId, this.pending));
    }
    this.pending = void 0;
  }
};
function createCodexRolloutAccumulator() {
  return new CodexRolloutAccumulator();
}
var CODEX_ROLLOUT_LOCATION = {
  root: (homeDir) => `${homeDir}${import_node_path4.sep}.codex${import_node_path4.sep}sessions`,
  matches: (relativePath, sessionId) => {
    const base = relativePath.split(import_node_path4.sep).pop() ?? relativePath;
    return base.startsWith("rollout-") && base.endsWith(`-${sessionId}.jsonl`);
  }
};

// src/domain/formats/toml.ts
function parseToml(content) {
  return parse(content);
}
function stringifyToml(data) {
  return stringify(data);
}

// src/domain/tools/ai/codex.ts
var DIRECTORY2 = ".codex/";
var TOOL_SUFFIX2 = ".codex.md";
var AGENTS_SKILLS_PREFIX2 = ".agents/skills/";
var SKILLS_TO_AGENTS_RE = /\.codex\/skills\//g;
var AGENTS_SKILLS_PLAIN_RE = /\.agents\/skills\/aidd-/g;
function remapSkillPaths(content) {
  return content.replace(SKILLS_TO_AGENTS_RE, ".agents/skills/aidd-");
}
function reverseSkillPaths(content) {
  return content.replace(AGENTS_SKILLS_PLAIN_RE, ".codex/skills/");
}
function rewriteCodexContent(content, context) {
  const step1 = baseRewriteContent(content, context.directory, context.docsDir);
  const step2 = remapSkillPaths(step1);
  return step2.replace(
    /(@?)\.codex\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
    "$1.codex/commands/aidd/$2/$3"
  );
}
function reverseRewriteCodexContent(content, docsDir) {
  const step1 = reverseSkillPaths(content);
  return baseReverseRewriteContent(step1, DIRECTORY2, docsDir);
}
var MIN_PROJECT_DOC_MAX_BYTES = 262144;
var CONFIG_CODEX_HOOKS = "codex-hooks";
function parseSafe(content) {
  if (!content.trim()) return {};
  try {
    return parseToml(content);
  } catch {
    return {};
  }
}
function mergeMcpServers(existing, incoming) {
  const incomingServers = incoming.mcp_servers;
  if (!incomingServers) return;
  const existingServers = existing.mcp_servers ?? {};
  for (const [name, value] of Object.entries(incomingServers)) {
    if (!(name in existingServers)) {
      existingServers[name] = value;
    }
  }
  existing.mcp_servers = existingServers;
}
function ensureProjectDocMaxBytes(existing, incoming) {
  const existingVal = typeof existing.project_doc_max_bytes === "number" ? existing.project_doc_max_bytes : 0;
  const incomingVal = typeof incoming.project_doc_max_bytes === "number" ? incoming.project_doc_max_bytes : MIN_PROJECT_DOC_MAX_BYTES;
  if (existingVal >= MIN_PROJECT_DOC_MAX_BYTES) return;
  existing.project_doc_max_bytes = Math.max(existingVal, incomingVal, MIN_PROJECT_DOC_MAX_BYTES);
}
function ensureCodexHooks(existing) {
  const features = existing.features;
  if (features?.hooks !== void 0 || features?.codex_hooks !== void 0) return;
  existing.features = { ...features ?? {}, hooks: true };
}
function mergeCodexConfigToml(existing, aiddPayload) {
  const result = parseSafe(existing);
  const payload = parseSafe(aiddPayload);
  mergeMcpServers(result, payload);
  ensureProjectDocMaxBytes(result, payload);
  ensureCodexHooks(result);
  return stringifyToml(result);
}
var AIDD_HOOK_COMMAND = "node .aidd/scripts/update_memory.cjs";
var AIDD_HOOK_ENTRY = {
  type: "command",
  command: AIDD_HOOK_COMMAND,
  statusMessage: "Syncing AIDD memory...",
  timeout: 30
};
var AIDD_SESSION_START_ENTRY = {
  matcher: "startup|resume",
  hooks: [AIDD_HOOK_ENTRY]
};
function isAiddHookPresent(entries) {
  return entries.some((entry) => entry.hooks.some((hook) => hook.command === AIDD_HOOK_COMMAND));
}
function appendAiddEntry(entries) {
  if (isAiddHookPresent(entries)) return entries;
  return [...entries, AIDD_SESSION_START_ENTRY];
}
function mergeSessionStart(existing) {
  const current = existing.SessionStart;
  if (!Array.isArray(current)) {
    return { ...existing, SessionStart: [AIDD_SESSION_START_ENTRY] };
  }
  return { ...existing, SessionStart: appendAiddEntry(current) };
}
function mergeCodexHooksJson(existing) {
  let parsed = {};
  if (existing.trim()) {
    try {
      parsed = JSON.parse(existing);
    } catch {
      parsed = {};
    }
  }
  const merged = mergeSessionStart(parsed);
  return JSON.stringify(merged, null, 2);
}
function skillNameFromPath(fileName) {
  const parts = fileName.split("/");
  if (parts.length > 1) return parts[0];
  const base = parts[0];
  if (base.endsWith(TOOL_SUFFIX2)) return base.slice(0, -TOOL_SUFFIX2.length);
  if (base.endsWith(".md")) return base.slice(0, -3);
  return base;
}
function buildCodexSkillFilePath(fileName) {
  return `${AGENTS_SKILLS_PREFIX2}aidd-${skillNameFromPath(fileName)}/SKILL.md`;
}
function stripCodexSkillFrontmatter(fm) {
  const result = {};
  if (fm.name !== void 0) result.name = fm.name;
  if (fm.description !== void 0) result.description = fm.description;
  if (fm.allowed_tools !== void 0) result.allowed_tools = fm.allowed_tools;
  return result;
}
var codex = {
  kind: "ai",
  toolId: "codex",
  displayName: "Codex",
  directory: DIRECTORY2,
  toolSuffix: TOOL_SUFFIX2,
  signalDir: `${DIRECTORY2}commands`,
  configOutputPaths: { "config.toml": ".codex/config.toml" },
  capabilities: {
    agents: new AgentsCapability({ directory: DIRECTORY2, toolSuffix: TOOL_SUFFIX2, format: "toml" }),
    skills: new SkillsCapability({
      prefix: "aidd-",
      buildInstallPath: buildCodexSkillFilePath,
      convertFrontmatter: stripCodexSkillFrontmatter,
      reverseConvertFrontmatter: (fm) => fm
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY2,
      toolSuffix: TOOL_SUFFIX2,
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY2, fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm)
    }),
    rules: new RulesCapability({
      directory: DIRECTORY2,
      toolSuffix: TOOL_SUFFIX2,
      buildInstallPath: (fileName) => `${DIRECTORY2}rules/${stripToolSuffix(TOOL_SUFFIX2, fileName)}`,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm
    }),
    mcp: new McpCapability({
      outputPath: ".codex/config.toml",
      format: "toml",
      entrySection: "mcp_servers",
      mergeFn: mergeCodexConfigToml,
      consumes: [CONFIG_MCP]
    }),
    hooks: new HooksCapability({
      outputPath: ".codex/hooks.json",
      mergeStrategy: "user-prime",
      entrySection: "SessionStart",
      mergeFn: mergeCodexHooksJson,
      consumes: [CONFIG_CODEX_HOOKS]
    }),
    plugins: new PluginsCapability({
      mode: "native",
      pluginsDir: ".codex/plugins/",
      pluginManifestRelativePath: "plugin.json",
      acceptsMcp: true,
      translationMode: "marketplace",
      // Codex only enables plugins from its user-global config (~/.codex/config.toml)
      // plus its plugin cache (~/.codex/plugins/cache/). A project-local settings file
      // is inert, so we drive the `codex` CLI directly during marketplace sync instead.
      nativeActivation: { binary: "codex" }
    })
  },
  // Whoever writes Codex's telemetry activation: its `otel.metrics_exporter` defaults
  // to `statsig`, a third party nobody chose. Set it explicitly (e.g. "otlp") in the
  // `[otel]` block, or enabling telemetry silently ships metrics off-project.
  telemetry: {
    kind: "planned",
    trackedIn: "#653"
  },
  // Measured 2026-08-13: `conversation.id` on `codex.sse_event`, zero-token to verify —
  // the identifier is minted client-side before any model call. Turn identifier and
  // metrics export are unmeasured.
  telemetryExport: {
    kind: "declared",
    identityAttribute: "conversation.id",
    // Declared from a zero-token capture that established the identifier and nothing else:
    // no counters have ever been observed flowing through this route.
    supplies: { tokenCounters: false, amount: false, toolStatedStep: false }
  },
  // Measured 2026-08-20: a rollout's `token_count` events carry counters but no model and
  // no request id — those come from the preceding `turn_context` event, keyed on `turn_id`.
  // Resolved by `session_meta.id`, not `session_id`, which a resumed session's rollout can
  // disagree with. See codex-rollout.ts for the full measurement and its two captured
  // fixtures.
  telemetryLocalRead: {
    kind: "declared",
    transcript: CODEX_ROLLOUT_LOCATION,
    // Complete counters per turn, no currency anywhere in a rollout, and no field naming a
    // running skill - so a step here can only ever come from a run journal interval.
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false }
  },
  telemetryTaskAttributable: false,
  telemetryJournalHost: "codex",
  rewriteContent(content, docsDir) {
    return rewriteCodexContent(content, { directory: DIRECTORY2, docsDir });
  },
  reverseRewriteContent(content, docsDir) {
    return reverseRewriteCodexContent(content, docsDir);
  },
  detectUserFileSectionKey(relativePath) {
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${AGENTS_SKILLS_PREFIX2}aidd-`, "skills"],
      [`${DIRECTORY2}agents/`, "agents"],
      [`${DIRECTORY2}commands/aidd/`, "commands"],
      [`${DIRECTORY2}rules/`, "rules"]
    ]);
  }
};
registerTool(codex);

// src/domain/capabilities/settings-capability.ts
var SettingsCapability = class {
  constructor(params) {
    this.params = params;
    if (params.staticContent !== void 0 && params.staticContentAssetFile !== void 0) {
      throw new CapabilityConfigError(
        "SettingsCapability: set either 'staticContent' or 'staticContentAssetFile', not both."
      );
    }
    const hasStaticForm = params.staticContent !== void 0 || params.staticContentAssetFile !== void 0;
    if (params.consumes?.length && hasStaticForm) {
      throw new CapabilityConfigError(
        "SettingsCapability: set either 'consumes' or 'staticContent', not both."
      );
    }
    if (params.requiresTool !== void 0 && !hasStaticForm) {
      throw new CapabilityConfigError(
        "SettingsCapability: 'requiresTool' is only meaningful with 'staticContent'."
      );
    }
    this.consumes = params.consumes ?? [];
    this.staticContent = params.staticContent;
    this.staticContentAssetFile = params.staticContentAssetFile;
    this.requiresTool = params.requiresTool;
  }
  consumes;
  staticContent;
  staticContentAssetFile;
  requiresTool;
  accepts(relativePath) {
    return relativePath === this.params.outputPath;
  }
  getMergeStrategy() {
    return this.params.mergeStrategy;
  }
  buildOutputPath() {
    return this.params.outputPath;
  }
  equals(other) {
    return this.params.outputPath === other.params.outputPath && this.params.mergeStrategy === other.params.mergeStrategy;
  }
};

// src/domain/tools/ai/copilot-paths.ts
var COPILOT_WORKSPACE_DIR = ".github/";

// src/domain/tools/ai/copilot.ts
var DIRECTORY3 = COPILOT_WORKSPACE_DIR;
var TOOL_SUFFIX3 = ".copilot.md";
var EXT_AGENT = ".agent.md";
var EXT_PROMPT = ".prompt.md";
var EXT_INSTRUCTIONS = ".instructions.md";
function basename(path) {
  return path.split("/").at(-1) ?? path;
}
function flattenFileName(fileName, targetExt, options = {}) {
  const parts = fileName.split("/");
  let baseName = parts[parts.length - 1];
  if (options.stripNumericPrefix) {
    baseName = baseName.replace(/^\d+[_-]/, "");
  }
  if (options.toolSuffix && baseName.endsWith(options.toolSuffix)) {
    baseName = `${baseName.slice(0, -options.toolSuffix.length)}.md`;
  }
  baseName = baseName.replaceAll("_", "-");
  const withExt = addTargetExtension(baseName, targetExt);
  if (parts.length === 1) {
    return withExt;
  }
  const prefix = buildPrefix(parts.slice(0, -1).join("/"));
  return `${prefix}-${withExt}`;
}
function buildPrefix(subPath) {
  return subPath.split("/").map((p) => p.replace(/^(\d+)[_-].*$/, "$1")).join("-");
}
function addTargetExtension(baseName, targetExt) {
  if (baseName.endsWith(targetExt)) return baseName;
  const withoutMd = baseName.endsWith(".md") ? baseName.slice(0, -3) : baseName;
  return `${withoutMd}${targetExt}`;
}
function escapedRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
var agentsHandler = {
  buildFilePath(fileName) {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const name = base.endsWith(".md") ? `${base.slice(0, -3)}${EXT_AGENT}` : base;
    return `${DIRECTORY3}agents/${name}`;
  },
  convertFrontmatter(fm, fileName) {
    const base = fileName?.split("/").at(-1);
    const name = fm.name ?? base?.replace(/\.md$/, "");
    return { name: typeof name === "string" ? name : void 0, description: fm.description };
  },
  reverseConvertFrontmatter(fm) {
    return { name: fm.name, description: fm.description };
  }
};
var commandsHandler = {
  buildFilePath(fileName) {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const flat = flattenFileName(fileName, EXT_PROMPT);
    return `${DIRECTORY3}prompts/${flat}`;
  },
  convertFrontmatter(fm, relativeFileName) {
    return convertCommandFrontmatter(fm, relativeFileName);
  },
  reverseConvertFrontmatter(fm) {
    return reverseConvertCommandFrontmatter(fm);
  }
};
var rulesHandler = {
  buildFilePath(fileName) {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    const flat = flattenFileName(fileName, EXT_INSTRUCTIONS, {
      toolSuffix: TOOL_SUFFIX3,
      stripNumericPrefix: true
    });
    return `${DIRECTORY3}instructions/${flat}`;
  },
  convertFrontmatter(fm) {
    const { paths, globs } = fm;
    const patterns = Array.isArray(paths) ? paths : Array.isArray(globs) ? globs : null;
    if (patterns !== null && patterns.length > 0) return { applyTo: patterns.join(",") };
    if (fm.alwaysApply === false && fm.description !== void 0) {
      return { description: fm.description };
    }
    return {};
  },
  reverseConvertFrontmatter(fm) {
    const { applyTo } = fm;
    if (typeof applyTo === "string" && applyTo !== "**") {
      return { paths: applyTo.split(",").map((s) => s.trim()) };
    }
    return {};
  }
};
var skillsHandler = {
  buildFilePath(fileName) {
    const base = basename(fileName);
    if (base === GITKEEP_FILE) return null;
    return `${DIRECTORY3}skills/${fileName}`;
  },
  convertFrontmatter(fm) {
    return fm;
  },
  reverseConvertFrontmatter(fm) {
    return fm;
  }
};
function resolveInstalledPath(path) {
  if (path.startsWith("agents/")) {
    const subPath = path.slice("agents/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY3}agents/${subPath}`;
    return agentsHandler.buildFilePath(subPath) ?? `${DIRECTORY3}${path}`;
  }
  if (path.startsWith("commands/")) {
    const subPath = path.slice("commands/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY3}prompts/${subPath}`;
    return commandsHandler.buildFilePath(subPath) ?? `${DIRECTORY3}${path}`;
  }
  if (path.startsWith("rules/")) {
    const subPath = path.slice("rules/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY3}instructions/${subPath}`;
    return rulesHandler.buildFilePath(subPath) ?? `${DIRECTORY3}${path}`;
  }
  if (path.startsWith("skills/")) {
    const subPath = path.slice("skills/".length);
    if (subPath === "" || subPath.endsWith("/")) return `${DIRECTORY3}skills/${subPath}`;
    return skillsHandler.buildFilePath(subPath) ?? `${DIRECTORY3}${path}`;
  }
  return `${DIRECTORY3}${path}`;
}
function rewriteCopilotContent(content, docsDir) {
  return content.replace(
    new RegExp(`${escapedRegex(AT_TOOLS_PLACEHOLDER)}([^\\s\`'">,]+)`, "g"),
    (_match, path) => {
      const fullPath = resolveInstalledPath(path);
      return `[${fullPath}](../../${fullPath})`;
    }
  ).replace(
    new RegExp(`${escapedRegex(AT_DOCS_PLACEHOLDER)}([^\\s\`'">,]+)`, "g"),
    (_match, path) => {
      return `[${docsDir}/${path}](../../${docsDir}/${path})`;
    }
  ).replaceAll("{{TOOLS}}/agents/", `${DIRECTORY3}agents/`).replace(/\{\{TOOLS\}\}\/commands\/([^\s\n`'">,]+)/g, (_match, path) => {
    const flat = flattenFileName(path, EXT_PROMPT);
    return `${DIRECTORY3}prompts/${flat}`;
  }).replaceAll("{{TOOLS}}/rules/", `${DIRECTORY3}instructions/`).replaceAll("{{TOOLS}}/skills/", `${DIRECTORY3}skills/`).replaceAll(TOOLS_PLACEHOLDER, DIRECTORY3).replaceAll(DOCS_PLACEHOLDER, `${docsDir}/`);
}
function reverseCopilotContent(content, docsDir) {
  return content.replace(
    /\[\.github\/agents\/([^\]]+)\]\([^)]+\)/g,
    (_match, path) => `${AT_TOOLS_PLACEHOLDER}agents/${path}`
  ).replace(
    /\[\.github\/prompts\/([^\]]+)\]\([^)]+\)/g,
    (_match, path) => `${AT_TOOLS_PLACEHOLDER}commands/${path}`
  ).replace(
    /\[\.github\/instructions\/([^\]]+)\]\([^)]+\)/g,
    (_match, path) => `${AT_TOOLS_PLACEHOLDER}rules/${path}`
  ).replace(
    /\[\.github\/skills\/([^\]]+)\]\([^)]+\)/g,
    (_match, path) => `${AT_TOOLS_PLACEHOLDER}skills/${path}`
  ).replace(
    new RegExp(`\\[${escapedRegex(docsDir)}\\/([^\\]]+)\\]\\([^)]+\\)`, "g"),
    (_match, path) => `${AT_DOCS_PLACEHOLDER}${path}`
  ).replaceAll(`${DIRECTORY3}agents/`, `${TOOLS_PLACEHOLDER}agents/`).replaceAll(`${DIRECTORY3}prompts/`, `${TOOLS_PLACEHOLDER}commands/`).replaceAll(`${DIRECTORY3}instructions/`, `${TOOLS_PLACEHOLDER}rules/`).replaceAll(`${DIRECTORY3}skills/`, `${TOOLS_PLACEHOLDER}skills/`).replaceAll(DIRECTORY3, TOOLS_PLACEHOLDER).replaceAll(`${docsDir}/`, DOCS_PLACEHOLDER);
}
var copilot = {
  kind: "ai",
  toolId: "copilot",
  displayName: "GitHub Copilot",
  directory: DIRECTORY3,
  toolSuffix: TOOL_SUFFIX3,
  signalDir: ".github/prompts",
  requiredIdeIds: ["vscode"],
  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY3,
      toolSuffix: EXT_AGENT,
      format: "markdown",
      userFileExt: EXT_AGENT,
      buildInstallPath: (fileName) => agentsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, fileName) => agentsHandler.convertFrontmatter(fm, fileName),
      reverseConvertFrontmatter: (fm) => agentsHandler.reverseConvertFrontmatter(fm)
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY3,
      toolSuffix: TOOL_SUFFIX3,
      buildInstallPath: (fileName) => skillsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => skillsHandler.convertFrontmatter(fm),
      reverseConvertFrontmatter: (fm) => skillsHandler.reverseConvertFrontmatter(fm)
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY3,
      toolSuffix: EXT_PROMPT,
      buildInstallPath: (fileName) => commandsHandler.buildFilePath(fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm)
    }),
    rules: new RulesCapability({
      directory: DIRECTORY3,
      toolSuffix: EXT_INSTRUCTIONS,
      inputSuffix: TOOL_SUFFIX3,
      buildInstallPath: (fileName) => rulesHandler.buildFilePath(fileName),
      convertFrontmatter: (fm) => rulesHandler.convertFrontmatter(fm),
      reverseConvertFrontmatter: (fm) => rulesHandler.reverseConvertFrontmatter(fm)
    }),
    mcp: new McpCapability({
      outputPath: ".vscode/mcp.json",
      format: "json",
      entrySection: "servers",
      consumes: [CONFIG_MCP],
      transformContent: (content) => {
        const parsed = JSON.parse(content);
        if ("mcpServers" in parsed && !("servers" in parsed)) {
          const { mcpServers, ...rest } = parsed;
          return JSON.stringify({ ...rest, servers: mcpServers }, null, 2);
        }
        return content;
      }
    }),
    settings: new SettingsCapability({
      outputPath: ".vscode/settings.json",
      mergeStrategy: "framework-prime",
      staticContentAssetFile: "vscode-settings.json",
      requiresTool: "vscode"
    }),
    plugins: new PluginsCapability({
      mode: "native",
      pluginsDir: ".github/plugins/",
      pluginManifestRelativePath: "plugin.json",
      acceptsHooks: true,
      acceptsMcp: true,
      translationMode: "marketplace",
      // Copilot treats enabledPlugins in settings.json as a recommendation, not an
      // auto-install (github/copilot-cli#2249); the project marketplace is also not
      // installable from project scope (#3088). Drive `copilot plugin install` to
      // actually load plugins — the settings file below still surfaces recommendations.
      nativeActivation: { binary: "copilot" },
      // VS Code Copilot: extraKnownMarketplaces in .github/copilot/settings.json.
      // chat.plugins.marketplaces has application scope and cannot be set in workspace
      // .vscode/settings.json — VSCode rejects it with "This setting has an application scope".
      // Source: https://code.visualstudio.com/docs/copilot/customization/agent-plugins
      marketplaceSettings: {
        settingsPath: ".github/copilot/settings.json",
        settingsKey: "extraKnownMarketplaces",
        enabledPluginsKey: "enabledPlugins",
        toEntry: buildDefaultMarketplaceEntry
      }
    })
  },
  telemetry: {
    kind: "environment-variable",
    variable: "COPILOT_OTEL_ENABLED",
    value: "true"
  },
  // Measured 2026-08-13, zero-credit to verify: `gen_ai.conversation.id` lives on the
  // `invoke_agent` span, not on a log record or a metric — a receiver that only listens
  // to /v1/logs and /v1/metrics never sees the one attribute that identifies a Copilot
  // session.
  telemetryExport: {
    kind: "declared",
    identityAttribute: "gen_ai.conversation.id",
    // The identifier lives on the `invoke_agent` span, and the receiver listens on
    // `/v1/logs` and `/v1/metrics` only - so nothing has ever reached storage by this
    // route, whatever the payload may hold.
    supplies: { tokenCounters: false, amount: false, toolStatedStep: false }
  },
  // Measured: Copilot's own local file carries `outputTokens` per turn and nothing else —
  // no per-request input figure exists on disk, so no per-step record can be built from
  // it. A gap this deliverable names rather than fills; see spec.md non-goals.
  telemetryLocalRead: {
    kind: "unsupported",
    reason: "Its file carries outputTokens per turn and nothing else \u2014 no per-request input figure exists to build a record from."
  },
  telemetryTaskAttributable: false,
  telemetryJournalHost: "copilot",
  rewriteContent: rewriteCopilotContent,
  reverseRewriteContent: reverseCopilotContent,
  detectUserFileSectionKey(relativePath) {
    if (relativePath.startsWith(`${DIRECTORY3}agents/`)) {
      const base = relativePath.slice(`${DIRECTORY3}agents/`.length);
      const key = base.endsWith(EXT_AGENT) ? `${base.slice(0, -EXT_AGENT.length)}.md` : base;
      return { section: "agents", key };
    }
    if (relativePath.startsWith(`${DIRECTORY3}skills/`)) {
      return { section: "skills", key: relativePath.slice(`${DIRECTORY3}skills/`.length) };
    }
    return null;
  }
};
registerTool(copilot);

// src/domain/tools/ai/cursor.ts
var import_node_path5 = require("path");
var DIRECTORY4 = ".cursor/";
var TOOL_SUFFIX4 = ".cursor.md";
var MDC_EXT = ".mdc";
function toMdc(fileName) {
  return fileName.endsWith(".md") ? `${fileName.slice(0, -3)}${MDC_EXT}` : fileName;
}
var cursor = {
  kind: "ai",
  toolId: "cursor",
  displayName: "Cursor",
  directory: DIRECTORY4,
  toolSuffix: TOOL_SUFFIX4,
  signalDir: ".cursor/commands",
  configOutputPaths: { "settings.json": ".cursor/settings.json" },
  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY4,
      toolSuffix: TOOL_SUFFIX4,
      format: "markdown"
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY4,
      toolSuffix: TOOL_SUFFIX4,
      buildInstallPath: (fileName) => `${DIRECTORY4}skills/${stripToolSuffix(TOOL_SUFFIX4, fileName)}`,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY4,
      toolSuffix: TOOL_SUFFIX4,
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY4, fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatter(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatter(fm)
    }),
    rules: new RulesCapability({
      directory: DIRECTORY4,
      toolSuffix: TOOL_SUFFIX4,
      buildInstallPath: (fileName) => `${DIRECTORY4}rules/${toMdc(stripToolSuffix(TOOL_SUFFIX4, fileName))}`,
      convertFrontmatter: (fm) => {
        const { paths, globs, description } = fm;
        const patterns = Array.isArray(paths) ? paths : Array.isArray(globs) ? globs : null;
        if (patterns === null || patterns.length === 0) {
          if (fm.alwaysApply === false && description !== void 0) {
            return { description, alwaysApply: false };
          }
          return {};
        }
        const result = {};
        if (description !== void 0) result.description = description;
        return {
          ...result,
          globs: JSON.stringify(patterns).replace(/,/g, ", "),
          alwaysApply: false
        };
      },
      reverseConvertFrontmatter: (fm) => {
        const { globs } = fm;
        if (Array.isArray(globs) && globs.length > 0) return { paths: globs };
        if (typeof globs === "string") {
          try {
            const parsed = JSON.parse(globs);
            if (Array.isArray(parsed) && parsed.length > 0) return { paths: parsed };
          } catch {
          }
        }
        return {};
      }
    }),
    mcp: new McpCapability({
      outputPath: `${DIRECTORY4}mcp.json`,
      format: "json",
      entrySection: "mcpServers",
      consumes: [CONFIG_MCP]
    }),
    plugins: new PluginsCapability({
      mode: "native",
      // Empty pluginsDir so translateNativeWithPaths computes pluginRoot = "<pluginName>/"
      // (base-relative keys like "aidd-context/commands/foo.md" per D2).
      pluginsDir: "",
      pluginManifestRelativePath: null,
      // plugin-local: Cursor auto-discovers hooks.json and mcp.json at the plugin root.
      acceptsHooks: true,
      hooksRelativePath: "hooks.json",
      hooksContentFormat: "cursor",
      acceptsMcp: true,
      mcpRelativePath: "mcp.json",
      installScope: "user",
      userPluginsDir: (h) => (0, import_node_path5.join)(h, ".cursor", "plugins", "local")
    })
  },
  telemetry: {
    kind: "external",
    reason: "Cannot be enabled by us \u2014 a team setting on an Enterprise plan, in beta.",
    remedy: "Enable it from your Cursor admin dashboard."
  },
  // Cursor's documentation names `cursor.conversation.id`, but no payload has ever been
  // captured: the export is an Enterprise team setting nobody here can turn on. A field
  // read from documentation is a guess, and a guess declared as measured is the kind of
  // false figure this whole layer exists to prevent.
  telemetryExport: { kind: "unmeasured" },
  // Measured: Cursor writes no token count in any file it produces — there is nothing
  // on disk for a local reader to find. A gap this deliverable names rather than fills;
  // see spec.md non-goals.
  telemetryLocalRead: {
    kind: "unsupported",
    reason: "It writes no token count in any file it produces."
  },
  telemetryTaskAttributable: false,
  telemetryJournalHost: "cursor",
  rewriteContent(content, docsDir) {
    return baseRewriteContent(content, DIRECTORY4, docsDir).replace(
      /(@?)\.cursor\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
      "$1.cursor/commands/aidd/$2/$3"
    ).replace(/(@\.cursor\/rules\/[^\s]+)\.md\b/g, "$1.mdc");
  },
  reverseRewriteContent(content, docsDir) {
    return baseReverseRewriteContent(
      content.replace(/(@\.cursor\/rules\/[^\s]+)\.mdc\b/g, "$1.md"),
      DIRECTORY4,
      docsDir
    );
  },
  detectUserFileSectionKey(relativePath) {
    if (relativePath.startsWith(`${DIRECTORY4}rules/`)) {
      const key = relativePath.slice(`${DIRECTORY4}rules/`.length);
      return { section: "rules", key: key.endsWith(".mdc") ? `${key.slice(0, -4)}.md` : key };
    }
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${DIRECTORY4}agents/`, "agents"],
      [`${DIRECTORY4}commands/aidd/`, "commands"],
      [`${DIRECTORY4}skills/`, "skills"]
    ]);
  }
};
registerTool(cursor);

// src/domain/tools/ai/opencode.ts
var import_node_path6 = require("path");
var DIRECTORY5 = ".opencode/";
var TOOL_SUFFIX5 = ".opencode.md";
function convertRawServer(name, server) {
  const enabled = server.disabled !== true;
  if ("command" in server) {
    const { command, args = [], env } = server;
    const local = { type: "local", command: [command, ...args], enabled };
    if (env && Object.keys(env).length > 0) local.environment = env;
    return local;
  }
  if ("url" in server) {
    return { type: "remote", url: server.url, enabled };
  }
  throw new InvalidMcpServerConfigError(name);
}
function transformMcpToOpencode(content) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new McpConfigError(
      `Cannot parse MCP config: ${err instanceof Error ? err.message : String(err)}`
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new McpConfigError("MCP config must be a JSON object");
  }
  const mcp = {};
  for (const [name, server] of Object.entries(parsed.mcpServers ?? {})) {
    mcp[name] = convertRawServer(name, server);
  }
  return JSON.stringify({ mcp }, null, 2);
}
var opencode = {
  kind: "ai",
  toolId: "opencode",
  displayName: "OpenCode",
  directory: DIRECTORY5,
  toolSuffix: TOOL_SUFFIX5,
  signalDir: ".opencode/commands",
  configOutputPaths: { "opencode.json": "opencode.json" },
  capabilities: {
    agents: new AgentsCapability({
      directory: DIRECTORY5,
      toolSuffix: TOOL_SUFFIX5,
      format: "markdown",
      convertFrontmatter: (fm) => ({ description: fm.description, mode: "subagent" }),
      reverseConvertFrontmatter: (fm) => ({ description: fm.description })
    }),
    skills: new SkillsCapability({
      directory: DIRECTORY5,
      toolSuffix: TOOL_SUFFIX5,
      buildInstallPath: (fileName) => `${DIRECTORY5}skills/${stripToolSuffix(TOOL_SUFFIX5, fileName)}`,
      convertFrontmatter: (fm) => fm,
      reverseConvertFrontmatter: (fm) => fm
    }),
    commands: new CommandsCapability({
      directory: DIRECTORY5,
      toolSuffix: TOOL_SUFFIX5,
      buildInstallPath: (fileName) => buildAiddCommandFilePath(DIRECTORY5, fileName),
      convertFrontmatter: (fm, relativeFileName) => convertCommandFrontmatterNoHint(fm, relativeFileName),
      reverseConvertFrontmatter: (fm) => reverseConvertCommandFrontmatterNoHint(fm)
    }),
    rules: new RulesCapability({
      directory: DIRECTORY5,
      toolSuffix: TOOL_SUFFIX5,
      buildInstallPath: (fileName) => `${DIRECTORY5}rules/${stripToolSuffix(TOOL_SUFFIX5, fileName)}`,
      convertFrontmatter: (fm) => {
        if (fm.alwaysApply === false && fm.description !== void 0) {
          return { description: fm.description };
        }
        return {};
      },
      reverseConvertFrontmatter: () => ({})
    }),
    mcp: new McpCapability({
      outputPath: "opencode.json",
      format: "json",
      entrySection: "mcp",
      mergeStrategy: "framework-prime",
      transformContent: transformMcpToOpencode,
      consumes: [CONFIG_MCP, CONFIG_OPENCODE],
      resolveOutputPath: async (projectRoot, fs) => {
        const jsonExists = await fs.fileExists((0, import_node_path6.join)(projectRoot, "opencode.json"));
        const jsoncExists = await fs.fileExists((0, import_node_path6.join)(projectRoot, "opencode.jsonc"));
        if (jsonExists && jsoncExists) throw new OpencodeDualConfigError();
        if (jsoncExists) return "opencode.jsonc";
        return "opencode.json";
      }
    }),
    // marketplaceSettings is not available in flat mode (FlatPluginsParams has no such field).
    // Additionally, opencode's plugin[] array accepts only npm package name strings —
    // there is no source/version concept that a marketplace entry could express.
    plugins: new PluginsCapability({
      mode: "flat",
      flatNamespacePrefix: "aidd-"
    })
  },
  telemetry: {
    kind: "planned",
    trackedIn: "#653"
  },
  // `session.id` on `ai.streamText` spans is documented behind `experimental.openTelemetry`,
  // but no session has been captured to confirm it against the hook-side identifier —
  // declared unmeasured rather than guessed.
  telemetryExport: {
    kind: "unmeasured"
  },
  // Read via `opencode export <sessionID> --sanitize` (OpencodeCostReaderAdapter),
  // measured 2026-08-20 on opencode 1.14.20 — see domain/formats/opencode-export.ts.
  // Unlike the other two local readers, this one cannot yet be joined to a run journal
  // entry: no hook or plugin payload has ever been captured carrying OpenCode's own
  // `ses_…` session identity, so there is nothing established to join on. It answers
  // only what it can answer alone — what a given OpenCode session consumed. Joining it
  // belongs with #676, which owns whether a plugin can write the journal at all.
  telemetryLocalRead: {
    kind: "declared",
    limitation: "read alone: no captured payload establishes that a hook or plugin sees OpenCode's own session id, so these figures cannot yet be joined to a run journal entry.",
    // Counters per message, and no amount: `info.cost` is `0` in every message captured
    // and its denomination was never established, so it is deliberately never read. No
    // field names a running skill either.
    supplies: { tokenCounters: true, amount: false, toolStatedStep: false }
  },
  telemetryTaskAttributable: false,
  rewriteContent(content, docsDir) {
    return baseRewriteContent(content, DIRECTORY5, docsDir).replace(
      /(@?)\.opencode\/commands\/(\d+)[_-][^/]+\/([^\s]+)/g,
      "$1.opencode/commands/aidd/$2/$3"
    );
  },
  reverseRewriteContent(content, docsDir) {
    return baseReverseRewriteContent(content, DIRECTORY5, docsDir);
  },
  detectUserFileSectionKey(relativePath) {
    return detectSectionKeyFromPrefixes(relativePath, [
      [`${DIRECTORY5}agents/`, "agents"],
      [`${DIRECTORY5}commands/aidd/`, "commands"],
      [`${DIRECTORY5}rules/`, "rules"],
      [`${DIRECTORY5}skills/`, "skills"]
    ]);
  }
};
registerTool(opencode);

// src/domain/models/step-attribution.ts
var STEP_ATTRIBUTION_SOURCES = [
  "tool-stated",
  "journal-interval",
  "unattributed"
];
var UNATTRIBUTED = { source: "unattributed" };
function parseableBoundaries(boundaries) {
  const timed = [];
  for (const boundary of boundaries) {
    const atMs = Date.parse(boundary.at);
    if (!Number.isNaN(atMs)) timed.push({ atMs, boundary });
  }
  return timed;
}
function buildStepIntervals(journal) {
  const timed = parseableBoundaries(journal.boundaries);
  const intervals = [];
  for (let i = 0; i < timed.length; i++) {
    const { atMs: startMs, boundary } = timed[i];
    if (boundary.type !== "step_start") continue;
    const endMs = timed[i + 1]?.atMs ?? Number.POSITIVE_INFINITY;
    intervals.push({ skill: boundary.skill, startMs, endMs });
  }
  return intervals;
}
function attributeMoment(intervals, momentIso) {
  if (momentIso === void 0) return UNATTRIBUTED;
  const momentMs = Date.parse(momentIso);
  if (Number.isNaN(momentMs)) return UNATTRIBUTED;
  const hit = intervals.find(
    (interval) => momentMs >= interval.startMs && momentMs < interval.endMs
  );
  return hit ? { source: "journal-interval", step: hit.skill } : UNATTRIBUTED;
}

// src/domain/models/task-identity.ts
var TASK_FOLDER_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\//u;
var TASK_FILE_PATTERN = /^aidd_docs\/tasks\/(\d{4}_\d{2})\/([^/]+)\.md$/u;
function taskIdentityFromWrittenPath(writtenPath) {
  if (writtenPath.includes("..")) return null;
  const match = TASK_FOLDER_PATTERN.exec(writtenPath) ?? TASK_FILE_PATTERN.exec(writtenPath);
  if (!match) return null;
  const [, month, name] = match;
  return month !== void 0 && name !== void 0 ? `${month}/${name}` : null;
}
function taskIdentitiesFromWrittenPaths(writtenPaths) {
  const seen = /* @__PURE__ */ new Set();
  const identities = [];
  for (const writtenPath of writtenPaths) {
    const identity = taskIdentityFromWrittenPath(writtenPath);
    if (identity !== null && !seen.has(identity)) {
      seen.add(identity);
      identities.push(identity);
    }
  }
  return identities;
}

// src/domain/models/cost-report.ts
var MICRO_USD_PER_USD = 1e6;
function toMicroUsd(costUsd) {
  return Math.round(costUsd * MICRO_USD_PER_USD);
}
function fromMicroUsd(microUsd) {
  return microUsd / MICRO_USD_PER_USD;
}
var COUNTER_FIELDS = [
  "inputTokens",
  "outputTokens",
  "cacheReadTokens",
  "cacheCreationTokens"
];
var COUNTER_SOURCE = {
  inputTokens: "input_tokens",
  outputTokens: "output_tokens",
  cacheReadTokens: "cache_read_tokens",
  cacheCreationTokens: "cache_creation_tokens"
};
var TotalsAccumulator = class {
  requests = 0;
  costMicroUsd;
  counters = /* @__PURE__ */ new Map();
  add(record) {
    this.requests += 1;
    if (record.cost_usd !== void 0) {
      this.costMicroUsd = (this.costMicroUsd ?? 0) + toMicroUsd(record.cost_usd);
    }
    for (const field of COUNTER_FIELDS) {
      const value = record[COUNTER_SOURCE[field]];
      if (typeof value === "number") {
        this.counters.set(field, (this.counters.get(field) ?? 0) + value);
      }
    }
  }
  build() {
    const counters = {};
    for (const field of COUNTER_FIELDS) {
      const value = this.counters.get(field);
      if (value !== void 0) counters[field] = value;
    }
    return {
      requests: this.requests,
      ...this.costMicroUsd === void 0 ? {} : { costMicroUsd: this.costMicroUsd },
      ...counters
    };
  }
};
function accumulateInto(groups, key, record) {
  const existing = groups.get(key);
  if (existing) {
    existing.add(record);
    return;
  }
  const created = new TotalsAccumulator();
  created.add(record);
  groups.set(key, created);
}
function bySize(rows, totalsOf, keyOf) {
  const weight = (row) => {
    const totals2 = totalsOf(row);
    return totals2.costMicroUsd ?? (totals2.inputTokens ?? 0) + (totals2.outputTokens ?? 0);
  };
  return [...rows].sort(
    (left, right) => weight(right) - weight(left) || keyOf(left).localeCompare(keyOf(right))
  );
}
var STEP_ROW_SEPARATOR = " ";
function stepRowKey(record) {
  return `${record.step_attribution}${STEP_ROW_SEPARATOR}${record.step ?? ""}`;
}
function addToStepGroup(groups, record) {
  const key = stepRowKey(record);
  const existing = groups.get(key);
  if (existing) {
    existing.totals.add(record);
    return;
  }
  const created = {
    attribution: record.step_attribution,
    ...record.step === void 0 ? {} : { step: record.step },
    totals: new TotalsAccumulator()
  };
  created.totals.add(record);
  groups.set(key, created);
}
function vendorIdsForTask(journals, task) {
  const vendorIds = /* @__PURE__ */ new Set();
  for (const journal of journals) {
    if (taskIdentitiesFromWrittenPaths(journal.writtenPaths).includes(task)) {
      vendorIds.add(journal.vendorId);
    }
  }
  return vendorIds;
}
function buildToolRows(declaredTools2, measured) {
  return declaredTools2.map((declaration) => ({
    tool: declaration.tool,
    coverage: declaration.coverage,
    ...declaration.reason === void 0 ? {} : { reason: declaration.reason },
    capability: declaration.capability,
    totals: measured.get(declaration.tool)?.build() ?? { requests: 0 }
  }));
}
function emptyGroups() {
  return {
    totals: new TotalsAccumulator(),
    steps: /* @__PURE__ */ new Map(),
    models: /* @__PURE__ */ new Map(),
    tools: /* @__PURE__ */ new Map(),
    attributions: /* @__PURE__ */ new Map()
  };
}
function accumulate(records) {
  const groups = emptyGroups();
  for (const record of records) {
    if (record.kind === "session") {
      if (record.active_time_s !== void 0) {
        groups.activeTimeSeconds = (groups.activeTimeSeconds ?? 0) + record.active_time_s;
      }
      continue;
    }
    groups.totals.add(record);
    addToStepGroup(groups.steps, record);
    accumulateInto(groups.attributions, record.step_attribution, record);
    accumulateInto(groups.tools, record.tool, record);
    if (record.model !== void 0) accumulateInto(groups.models, record.model, record);
  }
  return groups;
}
function attributionRows(attributions) {
  return STEP_ATTRIBUTION_SOURCES.map((attribution) => ({
    attribution,
    totals: attributions.get(attribution)?.build() ?? { requests: 0 }
  }));
}
function stepRows(steps) {
  const rows = [...steps.values()].map((group) => ({
    attribution: group.attribution,
    ...group.step === void 0 ? {} : { step: group.step },
    totals: group.totals.build()
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => `${row.step ?? ""}/${row.attribution}`
  );
}
function modelRows(models) {
  const rows = [...models].map(([model, accumulator]) => ({
    model,
    totals: accumulator.build()
  }));
  return bySize(
    rows,
    (row) => row.totals,
    (row) => row.model
  );
}
function buildCostReport(input) {
  const wanted = input.task === void 0 ? null : vendorIdsForTask(input.journals, input.task);
  const inScope = input.records.filter((record) => wanted === null || wanted.has(record.vendor_id));
  const groups = accumulate(inScope);
  return {
    fromDay: input.fromDay,
    toDay: input.toDay,
    ...input.task === void 0 ? {} : { task: input.task },
    sessions: new Set(inScope.map((record) => record.vendor_id)).size,
    totals: groups.totals.build(),
    ...groups.activeTimeSeconds === void 0 ? {} : { activeTimeSeconds: groups.activeTimeSeconds },
    bySteps: stepRows(groups.steps),
    byModels: modelRows(groups.models),
    byTools: buildToolRows(input.declaredTools, groups.tools),
    attributionMix: attributionRows(groups.attributions),
    undatedRecords: input.undatedRecords,
    unreadableLines: input.unreadableLines
  };
}

// src/application/display/cost-report-display.ts
var ATTRIBUTION_LABELS = {
  "tool-stated": "stated by the tool",
  "journal-interval": "from a journal interval",
  unattributed: "unattributed"
};
var UNKNOWN_AMOUNT = "amount unknown";
var NOTHING_MEASURED = "nothing in this period";
var LABEL_WIDTH = 26;
function formatCount(value) {
  return value.toLocaleString("en-US");
}
function formatAmount(microUsd) {
  return `$${fromMicroUsd(microUsd).toFixed(2)}`;
}
function totalTokens(totals2) {
  return (totals2.inputTokens ?? 0) + (totals2.outputTokens ?? 0) + (totals2.cacheReadTokens ?? 0) + (totals2.cacheCreationTokens ?? 0);
}
function shareBasis(totals2) {
  return totals2.costMicroUsd === void 0 ? { label: "of tokens", of: totalTokens(totals2) } : { label: "of cost", of: totals2.costMicroUsd };
}
function shareOf(totals2, basis, useCost) {
  if (basis === 0) return "  - ";
  const part = useCost ? totals2.costMicroUsd ?? 0 : totalTokens(totals2);
  return `${Math.round(part / basis * 100).toString().padStart(3)}%`;
}
function pad(label) {
  return label.padEnd(LABEL_WIDTH);
}
function printTotals(output, report) {
  const { totals: totals2 } = report;
  if (totals2.requests === 0) {
    output.print(`  ${pad("sessions")}${formatCount(report.sessions)}`);
    output.print(`  ${pad("requests")}${NOTHING_MEASURED}`);
    return;
  }
  const tokens = totalTokens(totals2);
  const cacheShare = tokens === 0 ? 0 : Math.round((totals2.cacheReadTokens ?? 0) / tokens * 100);
  output.print(`  ${pad("sessions")}${formatCount(report.sessions)}`);
  output.print(`  ${pad("requests")}${formatCount(totals2.requests)}`);
  output.print(`  ${pad("tokens")}${formatCount(tokens)}    ${cacheShare}% cache`);
  output.print(
    `  ${pad("cost")}${totals2.costMicroUsd === void 0 ? UNKNOWN_AMOUNT : formatAmount(totals2.costMicroUsd)}`
  );
  if (report.activeTimeSeconds !== void 0) {
    const minutes = Math.round(report.activeTimeSeconds / 60);
    output.print(
      `  ${pad("active time")}${formatCount(minutes)} min    per session; not attributable to steps`
    );
  }
}
function figureFor(totals2, useCost) {
  if (!useCost) return `${formatCount(totalTokens(totals2))} tokens`;
  return totals2.costMicroUsd === void 0 ? UNKNOWN_AMOUNT : formatAmount(totals2.costMicroUsd);
}
function printStepRows(output, rows, basis, useCost) {
  for (const row of rows) {
    const name = row.step ?? ATTRIBUTION_LABELS.unattributed;
    const strength = row.step === void 0 ? "" : `    ${ATTRIBUTION_LABELS[row.attribution]}`;
    output.print(
      `    ${pad(name)}${shareOf(row.totals, basis, useCost)}   ${figureFor(row.totals, useCost)}${strength}`
    );
  }
}
function printAttributionRows(output, rows, basis, useCost) {
  for (const row of rows) {
    output.print(
      `    ${pad(ATTRIBUTION_LABELS[row.attribution])}${shareOf(row.totals, basis, useCost)}`
    );
  }
}
function printToolRows(output, rows) {
  for (const row of rows) {
    const name = getAiToolConfig(row.tool).displayName;
    if (row.coverage === "not-covered") {
      output.print(`    ${pad(name)}not covered${row.reason ? ` \u2014 ${row.reason}` : ""}`);
      continue;
    }
    if (row.totals.requests === 0) {
      output.print(`    ${pad(name)}${NOTHING_MEASURED}${row.reason ? ` \u2014 ${row.reason}` : ""}`);
      continue;
    }
    const figure = row.totals.costMicroUsd === void 0 ? UNKNOWN_AMOUNT : formatAmount(row.totals.costMicroUsd);
    const tokens = `${formatCount(totalTokens(row.totals))} tokens`;
    output.print(`    ${pad(name)}${figure}   ${tokens}${row.reason ? ` \u2014 ${row.reason}` : ""}`);
  }
}
function printCaveats(output, report) {
  if (report.undatedRecords > 0) {
    output.print(
      `  ${formatCount(report.undatedRecords)} records carry no moment and are in no period`
    );
  }
  if (report.unreadableLines > 0) {
    output.print(`  ${formatCount(report.unreadableLines)} lines could not be read`);
  }
}
function printStepsAndAttribution(output, report, basis) {
  if (report.bySteps.length === 0) return;
  output.print("");
  output.print(`  by step    ${basis.label}`);
  printStepRows(output, report.bySteps, basis.of, basis.useCost);
  output.print("");
  output.print(`  attribution    ${basis.label}`);
  printAttributionRows(output, report.attributionMix, basis.of, basis.useCost);
}
function printModels(output, report, basis) {
  if (report.byModels.length === 0) return;
  output.print("");
  output.print(`  by model    ${basis.label}`);
  for (const row of report.byModels) {
    const share = shareOf(row.totals, basis.of, basis.useCost);
    output.print(`    ${pad(row.model)}${share}   ${figureFor(row.totals, basis.useCost)}`);
  }
}
function printCostReport(output, report) {
  const scope = report.task === void 0 ? "period" : `task ${report.task}`;
  output.print(`${scope}    ${report.fromDay} to ${report.toDay}`);
  output.print("");
  printTotals(output, report);
  const basis = {
    ...shareBasis(report.totals),
    useCost: report.totals.costMicroUsd !== void 0
  };
  printStepsAndAttribution(output, report, basis);
  printModels(output, report, basis);
  output.print("");
  output.print("  by tool");
  printToolRows(output, report.byTools);
  printCaveats(output, report);
}

// src/application/display/telemetry-display.ts
var LOCAL_COST_STATUS_LABELS = {
  found: "read",
  empty: "read, nothing found",
  // Never "nothing found": this tool has no trace of the session, so it can say nothing
  // about what it cost. Printing the two alike would let a session read as free.
  "not-found": "no session found",
  // Its reader failed, so nothing is known about this tool for this session and something
  // is wrong. Distinct from "no session found", where nothing is known and nothing is wrong.
  unreadable: "could not be read",
  "not-covered": "not covered"
};
function printLocalCostReadReport(output, result) {
  const yielded = result.sessions.filter(
    (session) => session.toolReports.some((report) => report.recordsFound > 0)
  ).length;
  if (result.sessions.length === 0) {
    output.print("  No session journalled yet \u2014 nothing to read.");
    return;
  }
  output.print(
    `  ${result.sessions.length} session${result.sessions.length === 1 ? "" : "s"} read, ${yielded} with records`
  );
  for (const report of result.toolReports) {
    const name = getAiToolConfig(report.tool).displayName;
    const label = LOCAL_COST_STATUS_LABELS[report.status];
    const counts = report.status === "found" ? ` (${report.recordsStored} new of ${report.recordsFound})` : "";
    const reason = report.reason ? ` \u2014 ${report.reason}` : "";
    const failures = report.sessionsFailed > 0 ? ` [${report.sessionsFailed} session${report.sessionsFailed === 1 ? "" : "s"} could not be read: ${report.failureReason}]` : "";
    output.print(`  ${name}: ${label}${counts}${reason}${failures}`);
  }
}

// src/application/output.ts
var CLIOutput = class {
  verbose;
  constructor(verbose = false) {
    this.verbose = verbose || process.env.AIDD_VERBOSE === "true";
  }
  // Logger interface — used by use-cases and infrastructure adapters
  debug(message) {
    if (this.verbose) process.stderr.write(`[verbose] ${message}
`);
  }
  info(message) {
    process.stdout.write(`${message}
`);
  }
  warn(message) {
    process.stderr.write(`Warning: ${message}
`);
  }
  // Command output
  print(message) {
    process.stdout.write(`${message}
`);
  }
  success(message) {
    process.stdout.write(`${message}
`);
  }
  error(message) {
    process.stderr.write(`Error: ${message}
`);
  }
};

// src/domain/models/telemetry-sink-record.ts
var SINK_SCHEMA_VERSION = 2;
var DAY_KEY_LENGTH = "YYYY-MM-DD".length;
function telemetrySinkRecordDayKey(record) {
  const at = record.event_timestamp;
  if (at === void 0) return void 0;
  if (at.length >= DAY_KEY_LENGTH && at.endsWith("Z")) return at.slice(0, DAY_KEY_LENGTH);
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? void 0 : parsed.toISOString().slice(0, DAY_KEY_LENGTH);
}
function serializeTelemetrySinkRecord(record) {
  return JSON.stringify(record);
}
function parseTelemetrySinkLine(line) {
  const parsed = JSON.parse(line);
  if (parsed.sink_schema_version !== SINK_SCHEMA_VERSION) {
    throw new UnknownTelemetrySinkSchemaVersionError(parsed.sink_schema_version);
  }
  return parsed;
}

// src/application/use-cases/telemetry/read-local-cost-use-case.ts
function isPresent(value) {
  return value !== void 0;
}
var STATUS_RANK = [
  "found",
  "unreadable",
  "empty",
  "not-found",
  "not-covered"
];
function strongestOf(tool, reports) {
  const nothingKnown = {
    tool,
    status: "not-found",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0
  };
  return reports.reduce(
    (strongest, report) => STATUS_RANK.indexOf(report.status) < STATUS_RANK.indexOf(strongest.status) ? report : strongest,
    reports[0] ?? nothingKnown
  );
}
function mergeOneTool(tool, sessions) {
  const reports = sessions.flatMap(
    (session) => session.toolReports.filter((report) => report.tool === tool)
  );
  const failures = reports.map((report) => report.failureReason).filter((reason) => reason !== void 0);
  return {
    ...strongestOf(tool, reports),
    recordsFound: reports.reduce((sum, report) => sum + report.recordsFound, 0),
    recordsStored: reports.reduce((sum, report) => sum + report.recordsStored, 0),
    sessionsFailed: failures.length,
    ...failures.length === 0 ? {} : { failureReason: failures[failures.length - 1] }
  };
}
function notCovered(tool, localRead) {
  return {
    tool,
    status: "not-covered",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 0,
    ...localRead.kind === "unsupported" ? { reason: localRead.reason } : {}
  };
}
function unreadable(tool, failure) {
  return {
    tool,
    status: "unreadable",
    recordsFound: 0,
    recordsStored: 0,
    sessionsFailed: 1,
    reason: failure,
    failureReason: failure
  };
}
function mergeToolReports(sessions) {
  return AI_TOOL_IDS.map((tool) => mergeOneTool(tool, sessions));
}
var ReadLocalCostUseCase = class {
  constructor(sink, readers, runJournalReader) {
    this.sink = sink;
    this.readers = readers;
    this.runJournalReader = runJournalReader;
  }
  async execute(options) {
    const at = options.at ?? /* @__PURE__ */ new Date();
    const sessionIds = options.sessionId === void 0 ? await this.journalledSessionIds() : [options.sessionId];
    const sessions = [];
    for (const sessionId of sessionIds) {
      sessions.push({ sessionId, toolReports: await this.readOneSession(sessionId, at) });
    }
    return { sessions, toolReports: mergeToolReports(sessions) };
  }
  /** Every session the journal names, oldest file first. A person has no other way to
   * learn a session identifier, and the journal has recorded every one of them since #663. */
  async journalledSessionIds() {
    const journals = await this.runJournalReader.list();
    const ids = journals.map((journal) => journal.session?.vendor_id).filter(isPresent);
    return [...new Set(ids)];
  }
  async readOneSession(sessionId, at) {
    const journal = await this.runJournalReader.read(sessionId);
    const intervals = journal ? buildStepIntervals(journal) : [];
    const toolReports = [];
    for (const tool of AI_TOOL_IDS) {
      toolReports.push(await this.readOneTool(tool, sessionId, at, intervals));
    }
    return toolReports;
  }
  async readOneTool(tool, sessionId, at, intervals) {
    const localRead = getAiToolConfig(tool).telemetryLocalRead;
    if (localRead.kind !== "declared") return notCovered(tool, localRead);
    const attempt = await this.attemptRead(tool, sessionId);
    if ("failure" in attempt) return unreadable(tool, attempt.failure);
    const candidates = attempt.records;
    const recordsStored = await this.storeNewCandidates(tool, sessionId, candidates, at, intervals);
    return {
      tool,
      status: candidates.length > 0 ? "found" : attempt.sessionFound ? "empty" : "not-found",
      recordsFound: candidates.length,
      recordsStored,
      sessionsFailed: 0,
      ...localRead.limitation !== void 0 ? { reason: localRead.limitation } : {}
    };
  }
  /** The one place this use case catches, and it catches for a reason the architecture's
   * "use-cases throw, never catch" rule does not cover: this is a fan-out over independent
   * sources, so a reader failing is not one operation that failed but one of several. A
   * throw here would cost every other tool's figures for a session none of them had any
   * trouble with — and, once a sweep reads every journalled session, every other session's
   * too. See https://github.com/ai-driven-dev/framework/issues/689. */
  async attemptRead(tool, sessionId) {
    const reader = this.readers.get(tool);
    if (!reader) return { records: [], sessionFound: false };
    try {
      return await reader.read(sessionId);
    } catch (error) {
      return { failure: error instanceof Error ? error.message : String(error) };
    }
  }
  /** Matches each candidate against what the sink already holds for this session, on
   * `turn_id` alone — never a hash of the line, since the tool's own file keeps growing
   * as the same record is read again. A candidate with no `turn_id` cannot be matched and
   * is always appended: the reader's contract forbids inventing a key for it. */
  async storeNewCandidates(tool, sessionId, candidates, at, intervals) {
    if (candidates.length === 0) return 0;
    const existing = await this.sink.readRecordsForVendor(sessionId);
    const storedTurnIds = new Set(
      existing.map((record) => record.turn_id).filter((id) => id !== void 0)
    );
    let stored = 0;
    for (const candidate of candidates) {
      if (candidate.turn_id !== void 0 && storedTurnIds.has(candidate.turn_id)) continue;
      await this.sink.appendRecord(this.stampProvenanceAndTool(tool, candidate, intervals), at);
      stored++;
    }
    return stored;
  }
  // The caller asked this tool's reader by name — that is the fact this stamps, never
  // inferred from the candidate itself, which the reader's contract forbids it naming.
  stampProvenanceAndTool(tool, candidate, intervals) {
    return {
      ...candidate,
      sink_schema_version: SINK_SCHEMA_VERSION,
      provenance: "local-read",
      tool,
      ...this.resolveStepAttribution(candidate, intervals)
    };
  }
  // Where the candidate itself carries `step`, the tool stated it directly (see
  // claude-code-transcript.ts) — exact, and never second-guessed by an interval, which is
  // only ever an inference. Everything else falls back to the journal, joined on the
  // candidate's own moment; a candidate with no moment, or one earlier than every
  // interval, comes back unattributed rather than folded into the nearest step.
  resolveStepAttribution(candidate, intervals) {
    if (candidate.step !== void 0) {
      return {
        step_attribution: "tool-stated",
        step: candidate.step,
        step_plugin: candidate.step_plugin
      };
    }
    const attribution = attributeMoment(intervals, candidate.event_timestamp);
    return { step_attribution: attribution.source, step: attribution.step, step_plugin: void 0 };
  }
};

// src/application/use-cases/telemetry/report-cost-use-case.ts
function declaredTools() {
  return AI_TOOL_IDS.map((tool) => {
    const config = getAiToolConfig(tool);
    const localRead = config.telemetryLocalRead;
    const capability2 = {
      localRead: localRead.kind === "declared" ? localRead.supplies : null,
      export: config.telemetryExport.kind === "declared" ? config.telemetryExport.supplies : null,
      journalAttributable: config.telemetryJournalHost !== void 0,
      taskAttributable: config.telemetryTaskAttributable
    };
    if (localRead.kind === "declared") {
      return {
        tool,
        coverage: "covered",
        ...localRead.limitation === void 0 ? {} : { reason: localRead.limitation },
        capability: capability2
      };
    }
    return {
      tool,
      coverage: "not-covered",
      ...localRead.kind === "unsupported" ? { reason: localRead.reason } : {},
      capability: capability2
    };
  });
}
function toSessionJournal(journal) {
  if (!journal.session) return null;
  return {
    vendorId: journal.session.vendor_id,
    tool: journal.session.tool,
    ...journal.session.project_id === void 0 ? {} : { projectId: journal.session.project_id },
    writtenPaths: journal.filesWritten.map((written) => written.path)
  };
}
var ReportCostUseCase = class {
  constructor(sink, runJournalReader) {
    this.sink = sink;
    this.runJournalReader = runJournalReader;
  }
  async execute(options) {
    const { fromDay, toDay } = options.period;
    const read = await this.sink.readRecordsInPeriod(
      /* @__PURE__ */ new Date(`${fromDay}T00:00:00Z`),
      /* @__PURE__ */ new Date(`${toDay}T00:00:00Z`)
    );
    const journals = await this.runJournalReader.list();
    return buildCostReport({
      fromDay,
      toDay,
      records: read.records,
      journals: journals.map(toSessionJournal).filter((journal) => journal !== null),
      declaredTools: declaredTools(),
      undatedRecords: read.undated.length,
      unreadableLines: read.skippedLines,
      ...options.task === void 0 ? {} : { task: options.task }
    });
  }
};

// src/domain/models/cost-report-envelope.ts
var COST_REPORT_ENVELOPE_VERSION = 1;
function supply(from) {
  return from === null ? null : {
    token_counters: from.tokenCounters,
    amount: from.amount,
    tool_stated_step: from.toolStatedStep
  };
}
function capability(from) {
  return {
    local_read: supply(from.localRead),
    export: supply(from.export),
    journal_attributable: from.journalAttributable,
    task_attributable: from.taskAttributable
  };
}
function toolRow(row) {
  return {
    tool: row.tool,
    coverage: row.coverage,
    ...row.reason === void 0 ? {} : { reason: row.reason },
    capability: capability(row.capability),
    totals: totals(row.totals)
  };
}
function stepRow(row) {
  return {
    ...row.step === void 0 ? {} : { step: row.step },
    attribution: row.attribution,
    totals: totals(row.totals)
  };
}
function totals(from) {
  return {
    requests: from.requests,
    ...from.costMicroUsd === void 0 ? {} : { cost_micro_usd: from.costMicroUsd },
    ...from.inputTokens === void 0 ? {} : { input_tokens: from.inputTokens },
    ...from.outputTokens === void 0 ? {} : { output_tokens: from.outputTokens },
    ...from.cacheReadTokens === void 0 ? {} : { cache_read_tokens: from.cacheReadTokens },
    ...from.cacheCreationTokens === void 0 ? {} : { cache_creation_tokens: from.cacheCreationTokens }
  };
}
function toCostReportEnvelope(report) {
  return {
    cost_report_version: COST_REPORT_ENVELOPE_VERSION,
    period: { from_day: report.fromDay, to_day: report.toDay },
    ...report.task === void 0 ? {} : { task: report.task },
    sessions: report.sessions,
    totals: totals(report.totals),
    ...report.activeTimeSeconds === void 0 ? {} : { active_time_s: report.activeTimeSeconds },
    by_step: report.bySteps.map(stepRow),
    by_model: report.byModels.map((row) => ({ model: row.model, totals: totals(row.totals) })),
    by_tool: report.byTools.map(toolRow),
    attribution: report.attributionMix.map((row) => ({
      attribution: row.attribution,
      totals: totals(row.totals)
    })),
    read: {
      undated_records: report.undatedRecords,
      unreadable_lines: report.unreadableLines
    }
  };
}

// src/domain/models/report-period.ts
var DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
var DAY_KEY_LENGTH2 = "YYYY-MM-DD".length;
var MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1e3;
var DEFAULT_REPORT_DAYS = 7;
var MAX_REPORT_DAYS = 3650;
function parseDay(flag, value) {
  if (!DAY_PATTERN.test(value)) throw new InvalidReportDayError(flag, value);
  const parsed = /* @__PURE__ */ new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new InvalidReportDayError(flag, value);
  if (dayKey(parsed) !== value) throw new InvalidReportDayError(flag, value);
  return value;
}
function parseSpan(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > MAX_REPORT_DAYS) {
    throw new InvalidReportSpanError(value, MAX_REPORT_DAYS);
  }
  return days;
}
function dayKey(at) {
  return at.toISOString().slice(0, DAY_KEY_LENGTH2);
}
function daysBefore(day, count) {
  return dayKey(new Date(Date.parse(`${day}T00:00:00Z`) - count * MILLISECONDS_PER_DAY));
}
function resolveReportPeriod(request, today) {
  const span = request.days === void 0 ? DEFAULT_REPORT_DAYS : parseSpan(request.days);
  const toDay = request.to === void 0 ? dayKey(today) : parseDay("--to", request.to);
  const fromDay = request.from === void 0 ? daysBefore(toDay, span - 1) : parseDay("--from", request.from);
  return fromDay <= toDay ? { fromDay, toDay } : { fromDay: toDay, toDay: fromDay };
}

// src/infrastructure/adapters/opencode-cost-reader-adapter.ts
var import_node_child_process = require("child_process");
var import_node_fs = require("fs");
var import_node_path7 = require("path");

// src/domain/formats/opencode-export.ts
var VENDOR_FIELD3 = "sessionID";
var TURN_FIELD3 = "id";
function asNumber3(value) {
  return typeof value === "number" ? value : void 0;
}
function asString3(value) {
  return typeof value === "string" ? value : void 0;
}
function isoFromEpochMillis(value) {
  const millis = asNumber3(value);
  if (millis === void 0 || millis <= 0) return void 0;
  const at = new Date(millis);
  return Number.isNaN(at.getTime()) ? void 0 : at.toISOString();
}
function buildIdentity2(info, sessionId) {
  const turnId = asString3(info.id);
  return {
    vendor_id: sessionId,
    vendor_field: VENDOR_FIELD3,
    ...turnId !== void 0 ? { turn_id: turnId, turn_field: TURN_FIELD3 } : {}
  };
}
function buildCounters(tokens) {
  const input = asNumber3(tokens.input);
  const output = asNumber3(tokens.output);
  const cacheRead = asNumber3(tokens.cache?.read);
  const cacheWrite = asNumber3(tokens.cache?.write);
  return {
    ...input !== void 0 ? { input_tokens: input } : {},
    ...output !== void 0 ? { output_tokens: output } : {},
    ...cacheRead !== void 0 ? { cache_read_tokens: cacheRead } : {},
    ...cacheWrite !== void 0 ? { cache_creation_tokens: cacheWrite } : {}
  };
}
function buildRecord3(info, sessionId) {
  if (info.tokens === void 0) return null;
  const model = asString3(info.modelID);
  const at = isoFromEpochMillis(info.time?.created);
  return {
    kind: "request",
    ...buildIdentity2(info, sessionId),
    ...model !== void 0 ? { model } : {},
    ...at !== void 0 ? { event_timestamp: at } : {},
    ...buildCounters(info.tokens)
  };
}
function mapOpencodeExportToSinkRecords(payload, sessionId) {
  const messages = payload?.messages ?? [];
  const records = [];
  for (const message of messages) {
    const record = buildRecord3(message?.info ?? {}, sessionId);
    if (record) records.push(record);
  }
  return records;
}

// src/infrastructure/adapters/opencode-cost-reader-adapter.ts
var BINARY = "opencode";
var DEFAULT_TIMEOUT_MS = 1e4;
var SESSION_NOT_FOUND = /session not found/i;
var OpencodeCostReaderAdapter = class {
  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }
  async read(sessionId) {
    if (!this.isAvailable()) return { records: [], sessionFound: false };
    const result = (0, import_node_child_process.spawnSync)(BINARY, ["export", sessionId, "--sanitize"], {
      timeout: this.timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8"
    });
    if (result.error) {
      throw new OpencodeExportError(
        `${BINARY} export ${sessionId} failed: ${result.error.message}`
      );
    }
    if (result.status !== 0) return this.handleFailure(sessionId, result.status, result.stderr);
    return {
      records: mapOpencodeExportToSinkRecords(
        this.parseExport(sessionId, result.stdout),
        sessionId
      ),
      sessionFound: true
    };
  }
  /** Filesystem check, not a `--version` probe — matches
   * `AbstractNativePluginCliAdapter.isAvailable`, since spawning just to test presence is
   * flake-prone under load. */
  isAvailable() {
    const dirs = (process.env.PATH ?? "").split(import_node_path7.delimiter).filter((dir) => dir !== "");
    return dirs.some((dir) => {
      try {
        (0, import_node_fs.accessSync)((0, import_node_path7.join)(dir, BINARY), import_node_fs.constants.X_OK);
        return true;
      } catch {
        return false;
      }
    });
  }
  handleFailure(sessionId, status, stderr) {
    if (SESSION_NOT_FOUND.test(stderr)) return { records: [], sessionFound: false };
    throw new OpencodeExportError(
      `${BINARY} export ${sessionId} exited with code ${status ?? "unknown"}: ${stderr.trim() || "no stderr output"}`
    );
  }
  parseExport(sessionId, stdout) {
    try {
      return JSON.parse(stdout);
    } catch (err) {
      throw new OpencodeExportError(
        `${BINARY} export ${sessionId} did not answer with JSON: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
};

// src/infrastructure/adapters/run-journal-reader-adapter.ts
var import_promises = require("fs/promises");
var import_node_path8 = require("path");
var ULID_LENGTH = 26;
var RUN_FILE_EXTENSION = ".jsonl";
function sanitizePathSegment(segment) {
  const cleaned = segment.replace(/[^\w.-]/gu, "-");
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "-" : cleaned;
}
function matchesVendorId(entry, wantedSegment) {
  if (!entry.endsWith(RUN_FILE_EXTENSION)) return false;
  const minLength = ULID_LENGTH + "__".length + RUN_FILE_EXTENSION.length;
  if (entry.length <= minLength) return false;
  if (entry.slice(ULID_LENGTH, ULID_LENGTH + 2) !== "__") return false;
  return entry.slice(ULID_LENGTH + 2, -RUN_FILE_EXTENSION.length) === wantedSegment;
}
function asString4(value) {
  return typeof value === "string" ? value : void 0;
}
function parseLine2(line) {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
function parseBoundary(parsed) {
  const at = asString4(parsed.at);
  if (at === void 0) return null;
  if (parsed.type === "turn_end") return { type: "turn_end", at };
  const skill = parsed.type === "step_start" ? asString4(parsed.skill) : void 0;
  return skill !== void 0 ? { type: "step_start", at, skill } : null;
}
function parseSessionStart(parsed) {
  if (parsed.type !== "session_start") return null;
  const at = asString4(parsed.at);
  const runId = asString4(parsed.run_id);
  const tool = asString4(parsed.tool);
  const vendorId = asString4(parsed.vendor_id);
  if (at === void 0 || runId === void 0 || tool === void 0 || vendorId === void 0) {
    return null;
  }
  const projectId = asString4(parsed.project_id);
  return {
    type: "session_start",
    at,
    run_id: runId,
    tool,
    vendor_id: vendorId,
    ...projectId === void 0 ? {} : { project_id: projectId }
  };
}
function parseFileWritten(parsed) {
  if (parsed.type !== "file_written") return null;
  const at = asString4(parsed.at);
  const writtenPath = asString4(parsed.path);
  return at === void 0 || writtenPath === void 0 ? null : { type: "file_written", at, path: writtenPath };
}
var RunJournalReaderAdapter = class {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }
  async read(sessionId) {
    const filePath = await this.findRunFile(this.runsDir(), sessionId);
    return filePath ? this.readJournal(filePath) : null;
  }
  async list() {
    const dir = this.runsDir();
    let entries;
    try {
      entries = await (0, import_promises.readdir)(dir);
    } catch {
      return [];
    }
    const journals = [];
    for (const entry of entries.sort()) {
      if (!entry.endsWith(RUN_FILE_EXTENSION)) continue;
      const journal = await this.readJournal((0, import_node_path8.join)(dir, entry));
      if (journal) journals.push(journal);
    }
    return journals;
  }
  runsDir() {
    return process.env.AIDD_RUNS_DIR || (0, import_node_path8.join)(this.projectRoot, "aidd_docs", "runs");
  }
  async findRunFile(dir, sessionId) {
    let entries;
    try {
      entries = await (0, import_promises.readdir)(dir);
    } catch {
      return null;
    }
    const wanted = sanitizePathSegment(sessionId);
    const match = entries.find((entry) => matchesVendorId(entry, wanted));
    return match ? (0, import_node_path8.join)(dir, match) : null;
  }
  async readJournal(filePath) {
    let content;
    try {
      content = await (0, import_promises.readFile)(filePath, "utf8");
    } catch {
      return null;
    }
    const boundaries = [];
    const filesWritten = [];
    let session;
    for (const line of content.split("\n")) {
      const parsed = parseLine2(line);
      if (!parsed) continue;
      const boundary = parseBoundary(parsed);
      if (boundary) {
        boundaries.push(boundary);
        continue;
      }
      const written = parseFileWritten(parsed);
      if (written) {
        filesWritten.push(written);
        continue;
      }
      session ??= parseSessionStart(parsed) ?? void 0;
    }
    return { boundaries, filesWritten, ...session ? { session } : {} };
  }
};

// src/infrastructure/adapters/telemetry-sink-adapter.ts
var import_promises2 = require("fs/promises");
var import_node_os = require("os");
var import_node_path9 = require("path");

// src/infrastructure/errors.ts
var TelemetrySinkUnwritableError = class extends Error {
  constructor(path, cause) {
    super(
      `Telemetry sink directory is not writable: ${path} (${cause instanceof Error ? cause.message : String(cause)})`
    );
    this.name = "TelemetrySinkUnwritableError";
  }
};

// src/infrastructure/adapters/telemetry-sink-adapter.ts
var DAY_FILE_EXTENSION = ".jsonl";
var PRIVATE_FILE_MODE = 384;
var DAY_KEY_LENGTH3 = "YYYY-MM-DD".length;
function dayKey2(at) {
  return at.toISOString().slice(0, DAY_KEY_LENGTH3);
}
function dayFileName(at) {
  return `${dayKey2(at)}${DAY_FILE_EXTENSION}`;
}
async function pathExists(path) {
  try {
    await (0, import_promises2.access)(path);
    return true;
  } catch {
    return false;
  }
}
var TelemetrySinkAdapter = class {
  rootDir;
  constructor(userConfigDir) {
    const base = userConfigDir ?? process.env.AIDD_USER_CONFIG_DIR ?? (0, import_node_path9.join)((0, import_node_os.homedir)(), ".config", "aidd");
    this.rootDir = (0, import_node_path9.join)(base, "telemetry");
  }
  async ensureWritable() {
    try {
      await (0, import_promises2.mkdir)(this.rootDir, { recursive: true });
      const probePath = (0, import_node_path9.join)(this.rootDir, `.write-check-${process.pid}`);
      await (0, import_promises2.writeFile)(probePath, "", { mode: PRIVATE_FILE_MODE });
      await (0, import_promises2.rm)(probePath, { force: true });
    } catch (error) {
      throw new TelemetrySinkUnwritableError(this.rootDir, error);
    }
  }
  async appendRecord(record, at) {
    const filePath = (0, import_node_path9.join)(this.rootDir, dayFileName(at));
    const dayFileIsNew = !await pathExists(filePath);
    await (0, import_promises2.mkdir)(this.rootDir, { recursive: true });
    await (0, import_promises2.appendFile)(filePath, `${serializeTelemetrySinkRecord(record)}
`, {
      mode: PRIVATE_FILE_MODE
    });
    return { filePath, dayFileIsNew };
  }
  async listDayFiles() {
    try {
      const entries = await (0, import_promises2.readdir)(this.rootDir);
      return entries.filter((entry) => entry.endsWith(DAY_FILE_EXTENSION)).sort();
    } catch {
      return [];
    }
  }
  async deleteDayFile(fileName) {
    await (0, import_promises2.rm)((0, import_node_path9.join)(this.rootDir, fileName), { force: true });
  }
  async readRecordsForVendor(vendorId) {
    const records = [];
    for (const fileName of await this.listDayFiles()) {
      records.push(...await this.readVendorRecordsFromFile(fileName, vendorId));
    }
    return records;
  }
  // Every day file is opened, not only the ones the period names: a session read locally
  // days after it ran is appended to today's file while its records carry their own, older
  // moments. Selecting by file name would be selecting by when we heard about the work.
  async readRecordsInPeriod(fromDay, toDay) {
    const [fromKey, toKey] = [dayKey2(fromDay), dayKey2(toDay)].sort();
    const records = [];
    const undated = [];
    let skippedLines = 0;
    for (const fileName of await this.listDayFiles()) {
      const read = await this.readAllRecordsFromFile(fileName);
      skippedLines += read.skippedLines;
      for (const record of read.records) {
        const key = telemetrySinkRecordDayKey(record);
        if (key === void 0) undated.push(record);
        else if (key >= fromKey && key <= toKey) records.push(record);
      }
    }
    return { records, undated, skippedLines };
  }
  async readAllRecordsFromFile(fileName) {
    let content;
    try {
      content = await (0, import_promises2.readFile)((0, import_node_path9.join)(this.rootDir, fileName), "utf8");
    } catch {
      return { records: [], skippedLines: 0 };
    }
    const records = [];
    let skippedLines = 0;
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      const record = this.parseLineOrSkip(line);
      if (record) records.push(record);
      else skippedLines += 1;
    }
    return { records, skippedLines };
  }
  async readVendorRecordsFromFile(fileName, vendorId) {
    const content = await (0, import_promises2.readFile)((0, import_node_path9.join)(this.rootDir, fileName), "utf8");
    const records = [];
    for (const line of content.split("\n")) {
      if (line.trim() === "") continue;
      const record = this.parseLineOrSkip(line);
      if (record?.vendor_id === vendorId) records.push(record);
    }
    return records;
  }
  // A torn final line (a concurrent write still in flight) or a stray older-schema line
  // must not fail an unrelated session's read — skipped, not translated, since there is
  // no typed exception a caller could usefully act on for one line among many.
  parseLineOrSkip(line) {
    try {
      return parseTelemetrySinkLine(line);
    } catch {
      return void 0;
    }
  }
};

// src/infrastructure/adapters/transcript-cost-reader-adapter.ts
var import_node_fs2 = require("fs");
var import_promises3 = require("fs/promises");
var import_node_path10 = require("path");
var import_node_readline = require("readline");
async function* walk(dir) {
  let entries;
  try {
    entries = await (0, import_promises3.readdir)(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const absolutePath = (0, import_node_path10.join)(dir, entry.name);
    if (entry.isDirectory()) yield* walk(absolutePath);
    else if (entry.isFile()) yield absolutePath;
  }
}
var TranscriptCostReaderAdapter = class {
  constructor(homeDir, location, createAccumulator) {
    this.homeDir = homeDir;
    this.location = location;
    this.createAccumulator = createAccumulator;
  }
  async read(sessionId) {
    const root = this.location.root(this.homeDir);
    const files = await this.findMatchingFiles(root, sessionId);
    const records = [];
    for (const file of files) {
      records.push(...await this.readFile(file));
    }
    return { records, sessionFound: files.length > 0 };
  }
  async findMatchingFiles(root, sessionId) {
    const matches = [];
    for await (const absolutePath of walk(root)) {
      const relativePath = (0, import_node_path10.relative)(root, absolutePath);
      if (this.location.matches(relativePath, sessionId)) matches.push(absolutePath);
    }
    return matches;
  }
  async readFile(path) {
    const accumulator = this.createAccumulator();
    const lines = (0, import_node_readline.createInterface)({ input: (0, import_node_fs2.createReadStream)(path), crlfDelay: Infinity });
    for await (const line of lines) accumulator.push(line);
    return accumulator.build();
  }
};

// src/plugin-bin/telemetry-report.ts
var USAGE = [
  "Usage:",
  "  telemetry-report read [--session <id>]",
  "  telemetry-report report [--from <day>] [--to <day>] [--days <n>] [--task <id>] [--json]"
].join("\n");
function flagOf(argv, name) {
  const at = argv.indexOf(name);
  return at === -1 ? void 0 : argv[at + 1];
}
function periodRequest(argv) {
  const from = flagOf(argv, "--from");
  const to = flagOf(argv, "--to");
  const days = flagOf(argv, "--days");
  return {
    ...from === void 0 ? {} : { from },
    ...to === void 0 ? {} : { to },
    ...days === void 0 ? {} : { days }
  };
}
function localCostReaders() {
  return /* @__PURE__ */ new Map([
    ["opencode", new OpencodeCostReaderAdapter()],
    [
      "claude",
      new TranscriptCostReaderAdapter(
        (0, import_node_os2.homedir)(),
        CLAUDE_CODE_TRANSCRIPT_LOCATION,
        createClaudeCodeTranscriptAccumulator
      )
    ],
    [
      "codex",
      new TranscriptCostReaderAdapter(
        (0, import_node_os2.homedir)(),
        CODEX_ROLLOUT_LOCATION,
        createCodexRolloutAccumulator
      )
    ]
  ]);
}
async function runRead(argv, output, root) {
  const session = flagOf(argv, "--session");
  const useCase = new ReadLocalCostUseCase(
    new TelemetrySinkAdapter(),
    localCostReaders(),
    new RunJournalReaderAdapter(root)
  );
  printLocalCostReadReport(
    output,
    await useCase.execute(session === void 0 ? {} : { sessionId: session })
  );
}
async function runReport(argv, output, root) {
  const period = resolveReportPeriod(periodRequest(argv), /* @__PURE__ */ new Date());
  const task = flagOf(argv, "--task");
  const report = await new ReportCostUseCase(
    new TelemetrySinkAdapter(),
    new RunJournalReaderAdapter(root)
  ).execute({ period, ...task === void 0 ? {} : { task } });
  if (argv.includes("--json")) output.print(JSON.stringify(toCostReportEnvelope(report), null, 2));
  else printCostReport(output, report);
}
async function main() {
  const argv = process.argv.slice(2);
  const output = new CLIOutput(false);
  const root = process.cwd();
  if (argv[0] === "read") {
    await runRead(argv, output, root);
    return 0;
  }
  if (argv[0] === "report") {
    await runReport(argv, output, root);
    return 0;
  }
  output.error(USAGE);
  return 1;
}
main().then((code) => process.exit(code)).catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
});
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/primitive.js:
smol-toml/dist/util.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
