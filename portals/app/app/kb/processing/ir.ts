// The intermediate representation the parse stage produces (110-processing 4.2):
// an element tree - section hierarchy + element type + content + a locator. The
// IR is persisted so rechunking and reindexing consume it without re-reading the
// raw file, and a template-param change reprocesses from the chunk stage rather
// than paying the parse cost again.
//
// This module holds the IR shape and the FAST PATH parser (native text: md /
// txt / html-stripped). The DEEP PATH (scanned/complex layout via Atlas vision
// models) is stubbed - A1/A2 are unbuilt (TD-004) - but the IR it must produce is
// the same shape, so chunking does not care which path built it.

export type ElementType = "heading" | "paragraph" | "list_item" | "table" | "code";

export interface Locator {
  /** Paragraph/element ordinal within the document - always present. */
  ordinal: number;
  /** Page number, when the source has pages (pdf/deep path). */
  page?: number;
  /** Heading depth for a heading element (1..6). */
  depth?: number;
}

export interface Element {
  type: ElementType;
  /** The section path this element sits under, e.g. ["Setup", "Prerequisites"]. */
  sectionPath: string[];
  text: string;
  locator: Locator;
}

export interface DocumentIR {
  /** Parser version - a bump can scope a controlled rebuild (110-processing 4.2). */
  parserVersion: string;
  elements: Element[];
}

export const FAST_PATH_PARSER_VERSION = "fast-1";

/** Which parse path a mime type takes. deep = needs Atlas vision models (stubbed). */
export function parsePathFor(mime: string): "fast" | "deep" {
  const m = mime.toLowerCase();
  if (
    m.startsWith("text/") ||
    m === "text/markdown" ||
    m === "text/html" ||
    m.includes("markdown")
  ) {
    return "fast";
  }
  // pdf-with-text-layer would be fast, but we cannot tell from mime alone; the
  // orchestrator sniffs content. Everything else defaults to deep.
  return "deep";
}

// --- fast-path parser -------------------------------------------------------

/**
 * Parse native text into an element tree. Recognises Markdown-ish structure -
 * ATX headings, list items, fenced code, blank-line-separated paragraphs - which
 * is enough for md/txt/html-stripped. It maintains the running section path so
 * every element knows the headings above it, which is what contextual chunking
 * (100-kb-model) prefixes onto a chunk.
 */
export function parseFastPath(text: string): DocumentIR {
  const elements: Element[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sectionStack: { depth: number; title: string }[] = [];
  let ordinal = 0;
  let inFence = false;
  let fenceBuf: string[] = [];
  let paraBuf: string[] = [];

  const sectionPath = () => sectionStack.map((s) => s.title);

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const t = paraBuf.join(" ").trim();
    paraBuf = [];
    if (t) {
      elements.push({ type: "paragraph", sectionPath: sectionPath(), text: t, locator: { ordinal: ordinal++ } });
    }
  };

  for (const raw of lines) {
    const line = raw ?? "";

    // fenced code
    if (/^\s*```/.test(line)) {
      if (inFence) {
        elements.push({ type: "code", sectionPath: sectionPath(), text: fenceBuf.join("\n"), locator: { ordinal: ordinal++ } });
        fenceBuf = [];
        inFence = false;
      } else {
        flushPara();
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      fenceBuf.push(line);
      continue;
    }

    // ATX heading
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const depth = h[1].length;
      const title = h[2].trim();
      // pop deeper-or-equal headings, then push this one
      while (sectionStack.length && sectionStack[sectionStack.length - 1].depth >= depth) {
        sectionStack.pop();
      }
      elements.push({ type: "heading", sectionPath: sectionPath(), text: title, locator: { ordinal: ordinal++, depth } });
      sectionStack.push({ depth, title });
      continue;
    }

    // list item
    const li = /^\s*[-*+]\s+(.*)$/.exec(line) || /^\s*\d+\.\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      elements.push({ type: "list_item", sectionPath: sectionPath(), text: li[1].trim(), locator: { ordinal: ordinal++ } });
      continue;
    }

    // blank line = paragraph boundary
    if (line.trim() === "") {
      flushPara();
      continue;
    }

    paraBuf.push(line.trim());
  }
  flushPara();
  if (inFence && fenceBuf.length) {
    elements.push({ type: "code", sectionPath: sectionPath(), text: fenceBuf.join("\n"), locator: { ordinal: ordinal++ } });
  }

  return { parserVersion: FAST_PATH_PARSER_VERSION, elements };
}
