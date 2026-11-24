import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Generators may create new artifacts or reproduce identical bytes. Revisions
 * need a new path; no force flag can overwrite a different/frozen/reviewed file.
 */
export function writeReproducibleArtifact(path: string, content: string | Uint8Array): "created" | "unchanged" {
  mkdirSync(dirname(path), { recursive: true });
  let fd: number;
  try {
    fd = openSync(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== Buffer.byteLength(content) ||
        !readFileSync(path).equals(Buffer.from(content))) throw new Error("artifact_overwrite_refused");
    return "unchanged";
  }
  try { writeFileSync(fd, content, "utf8"); }
  finally { closeSync(fd); }
  return "created";
}
