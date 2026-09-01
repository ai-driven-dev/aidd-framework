// No inverse: stripJsonComments is lossy — stripped comments are not recoverable.
export function stripJsonComments(content: string): string {
  let result = "";
  let i = 0;
  let inString = false;
  while (i < content.length) {
    const ch = content[i];
    if (inString) {
      if (ch === "\\" && i + 1 < content.length) {
        result += ch + content[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      result += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }
    if (ch === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") i++;
      continue;
    }
    if (ch === "/" && content[i + 1] === "*") {
      i += 2;
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < content.length && " \t\n\r".includes(content[j])) j++;
      if (content[j] === "}" || content[j] === "]") {
        i++;
        continue;
      }
    }
    result += ch;
    i++;
  }
  return result;
}
