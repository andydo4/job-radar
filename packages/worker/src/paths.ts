import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, no matter where the script is run from. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * True when this module is the script being run (not imported by a test).
 * Compares real paths case-insensitively on Windows, where drive-letter case can differ.
 */
export function isMain(importMetaUrl: string): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const norm = (p: string) => {
    let r = resolve(p);
    try {
      r = realpathSync(r);
    } catch {
      /* file may not exist under this exact name */
    }
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  return norm(fileURLToPath(importMetaUrl)) === norm(argv1);
}
