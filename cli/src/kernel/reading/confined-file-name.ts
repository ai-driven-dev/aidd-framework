import { basename } from "node:path";

/** Whether `fileName` names exactly one entry directly inside the directory it will be joined
 * to — never a walk out of it, the directory itself, or a smuggled absolute path. `join`
 * normalises a `..` away visually yet still deletes where the result lands, so a name failing
 * this is refused before it reaches `rm`. */
export function isBareFileName(fileName: string): boolean {
  if (fileName === "" || fileName === "." || fileName === "..") return false;
  return basename(fileName) === fileName;
}
