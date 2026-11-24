// Usage: tsx scripts/knowledge/import-notices.ts manifest-json saved-html-directory output-json
import { readFileSync } from "node:fs";
import { resolve, basename } from "node:path";
import { importNotice, type NoticeInput } from "../../portals/app/app/kb/semantic/notice-corpus";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 3) throw new Error("usage: import-notices.ts manifest-json saved-html-directory output-json");
const inputs = JSON.parse(readFileSync(resolve(args[0]), "utf8")) as (NoticeInput & { file: string })[];
if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 50) throw new Error("invalid_notice_manifest");
const sources = inputs.map(({ file, ...input }) => {
  if (!file || basename(file) !== file || !file.endsWith(".html")) throw new Error("invalid_notice_filename");
  return importNotice(input, readFileSync(resolve(args[1], file), "utf8"));
});
if (new Set(sources.map(source => source.id)).size !== sources.length) throw new Error("duplicate_notice_source");
const corpus = { formatVersion: 1, dataClass: "public_business_notice_snapshot", sources };
writeReproducibleArtifact(resolve(args[2]), JSON.stringify(corpus, null, 2) + "\n");
console.log(JSON.stringify({ sources: sources.length, sections: sources.reduce((n, source) => n + source.sections.length, 0), acceptedGold: false }));
