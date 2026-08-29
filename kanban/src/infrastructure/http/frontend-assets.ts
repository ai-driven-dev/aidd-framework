import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface FrontendAssets {
  indexHtml: string;
  stylesCss: string;
  appJs: string;
}

const FRONTEND_DIRECTORY_NAME = "kanban-frontend";

function resolveFrontendDirectory(): string {
  return join(dirname(fileURLToPath(import.meta.url)), FRONTEND_DIRECTORY_NAME);
}

function readAsset(frontendDirectory: string, fileName: string): string {
  return readFileSync(join(frontendDirectory, fileName), "utf-8");
}

export function readFrontendAssets(): FrontendAssets {
  const frontendDirectory = resolveFrontendDirectory();

  return {
    indexHtml: readAsset(frontendDirectory, "index.html"),
    stylesCss: readAsset(frontendDirectory, "styles.css"),
    appJs: readAsset(frontendDirectory, "app.js"),
  };
}
