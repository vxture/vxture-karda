// Usage: tsx import-local-pdf.ts input-pdf metadata-json new-output-directory
import { execFileSync } from "node:child_process";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute, sep } from "node:path";
import { reconstructLocalPdf, type PdfExtraction } from "../../portals/app/app/kb/semantic/pdf-corpus";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 3) throw new Error("usage: import-local-pdf.ts input-pdf metadata-json new-output-directory");
// Owner materials stay outside this public Git checkout, including symlink paths.
const repo = realpathSync(resolve(import.meta.dirname, "../.."));
const withinRepo = (path: string) => { const part = relative(repo, path); return part === "" || (part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part)); };
const input = realpathSync(resolve(args[0]));
if (withinRepo(input)) throw new Error("local_pdf_must_stay_outside_repository");
const output = resolve(args[2]);
// No recursive creation: the existing parent can be resolved before any mutation.
const parent = realpathSync(resolve(output, ".."));
if (withinRepo(parent) || withinRepo(output)) throw new Error("local_pdf_output_must_stay_outside_repository");
const metadata = JSON.parse(readFileSync(resolve(args[1]), "utf8"));
if (!metadata || Object.keys(metadata).sort().join(",") !== "id,projectNumber,title") throw new Error("invalid_local_pdf_metadata");
const extracted = JSON.parse(execFileSync(process.env.KARDA_KNOWLEDGE_PYTHON ?? (process.platform === "win32" ? "python" : "python3"),
  [resolve(import.meta.dirname, "extract-pdf.py"), input], { encoding: "utf8", timeout: 30000, maxBuffer: 32 * 1024 * 1024 })) as PdfExtraction;
const source = reconstructLocalPdf({ ...extracted, ...metadata });
// Retain the exact binary; refuse if it changed after extraction.
const fd = openSync(input, "r"), bytes = Buffer.alloc(20 * 1024 * 1024 + 1);
let count = 0;
try { while (count < bytes.length) { const n = readSync(fd, bytes, count, bytes.length - count, null); if (!n) break; count += n; } }
finally { closeSync(fd); }
const snapshot = bytes.subarray(0, count);
if (count === bytes.length || createHash("sha256").update(snapshot).digest("hex") !== source.binarySha256) throw new Error("pdf_snapshot_changed");
mkdirSync(output); // Exclusive bundle creation; existing reviewed material is never overwritten.
writeReproducibleArtifact(resolve(output, "source.pdf"), snapshot);
writeReproducibleArtifact(resolve(output, "source.json"), JSON.stringify({ formatVersion: 1, dataClass: "owner_supplied_local_pdf_snapshot", sources: [source] }, null, 2) + "\n");
writeReproducibleArtifact(resolve(output, "source-origin.json"), JSON.stringify({ originalPath: input, binarySha256: source.binarySha256,
  sourceId: source.id, physicalPages: source.pages.length, blankTextPages: source.pages.filter(p => !p.text).map(p => p.page),
  limitations: ["Owner supplied historical snapshot; no authenticity, current validity or later amendments verified.",
    "No OCR; extracted text may omit images, signatures or table relationships. Verify key claims against the PDF.",
    "Local development material, not an independently frozen holdout or human-reviewed gold."] }, null, 2) + "\n");
console.log(JSON.stringify({ output, pages: source.pages.length, acceptedGold: false, dataClass: "owner_supplied_local_pdf_snapshot" }));
