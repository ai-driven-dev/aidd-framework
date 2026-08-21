import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(currentDir, "kanban-frontend");

function readAsset(filename: string): string {
  return readFileSync(join(frontendDir, filename), "utf-8");
}

export const FRONTEND_INDEX_HTML = readAsset("index.html");
export const FRONTEND_STYLES_CSS = readAsset("styles.css");
export const FRONTEND_APP_JS = readAsset("app.js");
