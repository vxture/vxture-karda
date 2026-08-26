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

/** A half-open character range `[start, end)` into the document's CANONICAL
 *  text - see `canonicalText`. This is the offset space all provenance shares:
 *  a chunk's source range and an assertion's span both index into it, which is
 *  what lets `get_evidence` intersect them. */
export interface SourceRange {
  start: number;
  end: number;
}

export interface Element {
  type: ElementType;
  /** The section path this element sits under, e.g. ["Setup", "Prerequisites"]. */
  sectionPath: string[];
  /** The element's content, NORMALISED (a paragraph's lines are joined, a
   *  heading's marker stripped). Not a slice of the canonical text - use
   *  `range` for that. */
  text: string;
  /** Where in the canonical text this element came from. Required, not
   *  optional: an element that cannot say where it came from cannot carry
   *  provenance, and an optional field would let that go missing silently. */
  range: SourceRange;
  locator: Locator;
}

/**
 * The one text every offset is measured against.
 *
 * Line endings are normalised and nothing else is: the raw bytes are what the
 * object store holds and what a re-parse would read, so the canonical text is
 * reconstructible from them at any time. Anything more aggressive (trimming,
 * whitespace collapse) would make offsets depend on a transformation nobody
 * recorded.
 */
export function canonicalText(raw: string): string {
  return raw.replace(/\r\n/g, "\n");
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
  // Normalise ONCE and keep it: every offset below is measured against this
  // exact string, and it is what `canonicalText` reproduces from the stored
  // bytes later.
  const canonical = canonicalText(text);
  const lines = canonical.split("\n");
  const sectionStack: { depth: number; title: string }[] = [];
  let ordinal = 0;
  let inFence = false;
  let fenceBuf: string[] = [];
  let fenceStart = 0;
  let paraBuf: string[] = [];
  let paraStart = 0;
  let paraEnd = 0;

  // Running position of the current line in the canonical text. Every element's
  // range comes from this, so the parser is the ONLY place that has to get
  // offsets right - nothing downstream re-derives them from normalised text,
  // which it could not do correctly anyway.
  let cursor = 0;

  const sectionPath = () => sectionStack.map((s) => s.title);

  const flushPara = () => {
    if (paraBuf.length === 0) return;
    const t = paraBuf.join(" ").trim();
    const range = { start: paraStart, end: paraEnd };
    paraBuf = [];
    if (t) {
      elements.push({ type: "paragraph", sectionPath: sectionPath(), text: t, range, locator: { ordinal: ordinal++ } });
    }
  };

  for (const raw of lines) {
    const line = raw ?? "";
    const lineStart = cursor;
    const lineEnd = cursor + line.length;
    cursor = lineEnd + 1; // the newline `split` consumed

    // fenced code
    if (/^\s*```/.test(line)) {
      if (inFence) {
        elements.push({
          type: "code",
          sectionPath: sectionPath(),
          text: fenceBuf.join("\n"),
          // From just after the opening fence to just before the closing one.
          range: { start: fenceStart, end: lineStart },
          locator: { ordinal: ordinal++ },
        });
        fenceBuf = [];
        inFence = false;
      } else {
        flushPara();
        inFence = true;
        fenceStart = cursor;
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
      elements.push({
        type: "heading",
        sectionPath: sectionPath(),
        text: title,
        // The whole heading line, marker included: the range says where this
        // came from, not what the parser kept.
        range: { start: lineStart, end: lineEnd },
        locator: { ordinal: ordinal++, depth },
      });
      sectionStack.push({ depth, title });
      continue;
    }

    // list item
    const li = /^\s*[-*+]\s+(.*)$/.exec(line) || /^\s*\d+\.\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      elements.push({
        type: "list_item",
        sectionPath: sectionPath(),
        text: li[1].trim(),
        range: { start: lineStart, end: lineEnd },
        locator: { ordinal: ordinal++ },
      });
      continue;
    }

    // blank line = paragraph boundary
    if (line.trim() === "") {
      flushPara();
      continue;
    }

    if (paraBuf.length === 0) paraStart = lineStart;
    paraEnd = lineEnd;
    paraBuf.push(line.trim());
  }
  flushPara();
  if (inFence && fenceBuf.length) {
    // Unterminated fence: it runs to the end of the document.
    elements.push({
      type: "code",
      sectionPath: sectionPath(),
      text: fenceBuf.join("\n"),
      range: { start: fenceStart, end: canonical.length },
      locator: { ordinal: ordinal++ },
    });
  }

  return { parserVersion: FAST_PATH_PARSER_VERSION, elements };
}
