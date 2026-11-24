import { createHash } from "node:crypto";
import type { EvaluationSource } from "./evaluation";

export interface NoticeInput {
  id: string;
  projectFamilyId: string;
  projectNumber: string;
  title: string;
  url: string;
  publishedOn: string;
  noticeKind: "tender" | "correction";
  savedHtmlSha256: string;
}
export interface NoticeSource extends EvaluationSource, NoticeInput {
  selectedHtml: string;
  selectedHtmlSha256: string;
  normalization: "ccgp-business-sections-v1";
  omittedSections: string[];
}
export const sha256 = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const entities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  ldquo: "\u201c", rdquo: "\u201d", lsquo: "\u2018", rsquo: "\u2019", mdash: "\u2014", ndash: "\u2013" };
function plain(html: string): string {
  return html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(?:p|tr|td|th|h[1-6])\s*>|<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, key: string) => {
      if (key.startsWith("#")) {
        const n = key[1].toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
        if (n < 1 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error("invalid_notice_entity");
        return String.fromCodePoint(n);
      }
      if (!(key.toLowerCase() in entities)) throw new Error("unknown_notice_entity");
      return entities[key.toLowerCase()];
    }).split("\n").map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
}

const correctionHeadings = ["\u4e00\u3001\u9879\u76ee\u57fa\u672c\u60c5\u51b5", "\u4e8c\u3001\u66f4\u6b63\u4fe1\u606f", "\u4e09\u3001\u5176\u4ed6\u8865\u5145\u4e8b\u5b9c"];
const tenderHeadings = [correctionHeadings[0], "\u4e8c\u3001\u7533\u8bf7\u4eba\u7684\u8d44\u683c\u8981\u6c42\uff1a",
  "\u4e09\u3001\u83b7\u53d6\u62db\u6807\u6587\u4ef6", "\u56db\u3001\u63d0\u4ea4\u6295\u6807\u6587\u4ef6\u622a\u6b62\u65f6\u95f4\u3001\u5f00\u6807\u65f6\u95f4\u548c\u5730\u70b9", "\u4e94\u3001\u516c\u544a\u671f\u9650", "\u516d\u3001\u5176\u4ed6\u8865\u5145\u4e8b\u5b9c"];

/** Pinned CCGP article shape only; headings and original source identity fail closed. */
export function importNotice(input: NoticeInput, savedHtml: string): NoticeSource {
  if (!/^[a-f0-9]{64}$/.test(input.savedHtmlSha256) || sha256(savedHtml) !== input.savedHtmlSha256) throw new Error("notice_snapshot_mismatch");
  if (!/^https:\/\/www\.ccgp\.gov\.cn\/cggg\/zygg\/(?:gzgg|gkzb)\/\d{6}\/t\d{8}_\d+\.htm$/.test(input.url) ||
      !input.projectFamilyId || !input.projectNumber || !input.title || !input.id ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn) || !["tender", "correction"].includes(input.noticeKind)) throw new Error("invalid_notice_identity");
  const title = savedHtml.match(/<title>([\s\S]*?)<\/title>/i)?.[1];
  if (!title || plain(title) !== input.title) throw new Error("notice_title_mismatch");
  const date = input.publishedOn.split("-");
  if (!savedHtml.includes(`${date[0]}\u5e74${date[1]}\u6708${date[2]}\u65e5`)) throw new Error("notice_date_mismatch");
  const body = savedHtml.match(/<div\s+class="vF_detail_content"\s*>([\s\S]*?)<\/div>\s*<\/div><!--vF_detail_content_container-->/)?.[1];
  if (!body || !body.includes(input.projectNumber)) throw new Error("notice_body_mismatch");
  const markers = [...body.matchAll(/<p\b[^>]*>\s*<strong>([^<]+)<\/strong>/g)];
  const headings = input.noticeKind === "correction" ? correctionHeadings : tenderHeadings;
  if (markers.length !== headings.length + 1 || markers.some((marker, i) => i < headings.length && plain(marker[1]) !== headings[i])) {
    throw new Error("notice_heading_mismatch");
  }
  const last = markers[headings.length];
  if (!/\u8054\u7cfb/.test(plain(last[1]))) throw new Error("notice_contact_boundary_missing");
  const selectedHtml = body.slice(markers[0].index, last.index);
  return reconstructNotice({ ...input, selectedHtml, selectedHtmlSha256: sha256(selectedHtml),
    normalization: "ccgp-business-sections-v1", omittedSections: ["summary_table", "contact_section", "attachments_not_downloaded", "navigation_and_footer"] });
}

/** Rebuild canonical text and anchors offline from the retained business HTML. */
export function reconstructNotice(input: NoticeInput & Pick<NoticeSource, "selectedHtml" | "selectedHtmlSha256" | "normalization" | "omittedSections">): NoticeSource {
  if (input.normalization !== "ccgp-business-sections-v1" || sha256(input.selectedHtml) !== input.selectedHtmlSha256) throw new Error("notice_selected_html_mismatch");
  const headings = input.noticeKind === "correction" ? correctionHeadings : tenderHeadings;
  const markers = [...input.selectedHtml.matchAll(/<p\b[^>]*>\s*<strong>([^<]+)<\/strong>/g)];
  if (markers.length !== headings.length || markers.some((marker, i) => plain(marker[1]) !== headings[i])) throw new Error("notice_heading_mismatch");
  let text = "";
  const sections = markers.map((marker, i) => {
    const section = plain(input.selectedHtml.slice(marker.index, markers[i + 1]?.index));
    const start = text.length; text += section + "\n";
    return { id: `section-${i + 1}`, label: headings[i], start, end: text.length - 1 };
  });
  return { ...input, edition: `${input.publishedOn} publication snapshot; attachments and full tender documents not included`,
    text, canonicalSha256: sha256(text), sections };
}
