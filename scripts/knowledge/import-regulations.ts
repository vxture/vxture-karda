// Reproduce the fixed historical source snapshot from a saved government HTML response.
// Usage: tsx scripts/knowledge/import-regulations.ts <saved-html> <output-json>
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error("usage: import-regulations.ts saved-html output-json");
const html = readFileSync(input, "utf8");
const title = "中华人民共和国政府采购法实施条例";
if (!html.includes("<title>" + title)) throw new Error("unexpected_source_title");
const block = html.match(/<div\b[^>]*id="UCAP-CONTENT"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
if (!block) throw new Error("missing_article_container");
const clean = block.replace(/<p\b[^>]*>\s*第[一二三四五六七八九十百]+章[^<]*<\/p>/g, "");
const matches = [...clean.matchAll(/<strong>\s*(第[一二三四五六七八九十百]+条)\s*<\/strong>([\s\S]*?)(?=<strong>\s*第[一二三四五六七八九十百]+条\s*<\/strong>|$)/g)];
if (matches.length !== 79 || matches[0][1] !== "第一条" || matches[78][1] !== "第七十九条") {
  throw new Error("unexpected_article_boundaries");
}
const digits=["","一","二","三","四","五","六","七","八","九"];
for (let index=0;index<matches.length;index++) {
  const n=index+1;
  const label=n<10 ? digits[n] : (n<20 ? "十" : digits[Math.floor(n/10)]+"十")+digits[n%10];
  if(matches[index][1]!=="第"+label+"条") throw new Error("nonsequential_article_markers");
}
const entities: Record<string,string> = {nbsp:" ",amp:"&",lt:"<",gt:">",quot:'"',apos:"'",ldquo:"“",rdquo:"”",lsquo:"‘",rsquo:"’"};
const plain = (value: string): string => value
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, key: string) => {
    if (key.startsWith("#x")) return String.fromCodePoint(parseInt(key.slice(2),16));
    if (key.startsWith("#")) return String.fromCodePoint(parseInt(key.slice(1),10));
    if (!(key in entities)) throw new Error("unsupported_html_entity");
    return entities[key];
  }).replace(/[\s\u3000]+/g, " ").trim();
let text = "";
const sections = matches.map((m,index) => {
  const sectionText = m[1] + " " + plain(m[2]);
  const start = text.length;
  text += sectionText + "\n";
  return {id:"reg-2015-art-" + (index+1), label:m[1], start, end:start+sectionText.length};
});
const hash = (value: string) => createHash("sha256").update(value,"utf8").digest("hex");
const corpus = {
  formatVersion:1,
  dataClass:"public_historical_source",
  sources:[{
    id:"procurement-regulations-2015",
    title,
    url:"https://www.gov.cn/zhengce/content/2015-02/27/content_9504.htm",
    publisher:"中国政府网",
    edition:"2015-02-27 published text; not a current-law determination",
    retrievedOn:"2026-11-24",
    htmlSnapshotSha256:hash(html),
    normalization:"govcn-strong-articles-v1; UTF-16 half-open character offsets",
    canonicalSha256:hash(text),
    text,
    sections,
  }],
};
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify(corpus,null,2)+"\n","utf8");
console.log(JSON.stringify({sources:1,sections:sections.length,canonicalSha256:hash(text)}));
