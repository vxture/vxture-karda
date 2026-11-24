// Usage: tsx scripts/knowledge/import-attachments.ts manifest-json saved-docx-directory output-json
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { reconstructAttachment, type AttachmentInput } from "../../portals/app/app/kb/semantic/attachment-corpus";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 3) throw new Error("usage: import-attachments.ts manifest-json saved-docx-directory output-json");
const inputs = JSON.parse(readFileSync(resolve(args[0]), "utf8")) as (AttachmentInput & { file: string })[];
if (!Array.isArray(inputs) || !inputs.length || inputs.length > 50) throw new Error("invalid_attachment_manifest");
const sources = inputs.map(({ file, ...input }) => {
  if (basename(file) !== file || !file.endsWith(".docx")) throw new Error("invalid_attachment_filename");
  const extracted = JSON.parse(execFileSync(process.platform === "win32" ? "python" : "python3",
    [resolve(import.meta.dirname, "extract-docx.py"), resolve(args[1], file)], { encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024 }));
  if (extracted.binarySha256 !== input.binarySha256 || extracted.documentXmlSha256 !== input.documentXmlSha256) throw new Error("attachment_snapshot_mismatch");
  return reconstructAttachment({ ...input, normalization: "docx-main-paragraphs-v1", paragraphs: extracted.paragraphs });
});
if (new Set(sources.map(s => s.id)).size !== sources.length) throw new Error("duplicate_attachment_source");
writeReproducibleArtifact(resolve(args[2]), JSON.stringify(sources, null, 2) + "\n");
console.log(JSON.stringify({ sources: sources.length, sections: sources.reduce((n, s) => n + s.sections.length, 0), acceptedGold: false }));
