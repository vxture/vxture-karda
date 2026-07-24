// The chunk stage (110-processing 5): turn an element tree into recall units,
// applying the processing template's strategy. Consumes IR only, never the raw
// file, so a template-param change reprocesses from here.
//
// Chunking is deterministic and model-free, so it is fully implemented and
// tested - the Atlas dependency is the NEXT stage (embed), not this one.
import type { DocumentIR, Element } from "./ir";

export interface ChunkParams {
  targetTokens: number; // KD-007: 512
  maxTokens: number; // KD-007: 1024
  overlap: number; // KD-007: 0
}

export const DEFAULT_CHUNK_PARAMS: ChunkParams = { targetTokens: 512, maxTokens: 1024, overlap: 0 };

export interface Chunk {
  ordinal: number;
  /** The search text: contextual prefix (section path) + element content. */
  text: string;
  /** Where this came from - fed into Chunk.locator for citation provenance. */
  locator: { ordinal: number; page?: number };
  tokenCount: number;
}

// A word-based token estimate. Real tokenization is the embedding model's, but
// chunking only needs a stable proxy to size splits; a word count is monotonic
// with tokens and deterministic, which is all the boundary logic requires.
export function estimateTokens(text: string): number {
  const t = text.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

/** Section path prefix (contextual chunking, 100-kb-model): headings above the element. */
function contextPrefix(sectionPath: string[]): string {
  return sectionPath.length ? sectionPath.join(" > ") + "\n" : "";
}

/**
 * Chunk an element tree. The `general` strategy: group consecutive elements
 * under the same section up to the target size, split an over-long element at
 * semantic (sentence) breaks, and never emit an empty chunk. This is the default
 * (KD-007); other templates (qa/table/manual/paper/legal) specialise it, tracked
 * for the deep-path work - `general` is the one that must be right first because
 * every fast-path document uses it.
 */
export function chunkGeneral(ir: DocumentIR, params: ChunkParams = DEFAULT_CHUNK_PARAMS): Chunk[] {
  const chunks: Chunk[] = [];
  let ordinal = 0;

  let buf: Element[] = [];
  let bufTokens = 0;
  let bufSection: string | null = null;

  const flush = () => {
    if (buf.length === 0) return;
    const prefix = contextPrefix(buf[0].sectionPath);
    const body = buf.map((e) => e.text).join("\n");
    const text = prefix + body;
    chunks.push({
      ordinal: ordinal++,
      text,
      locator: { ordinal: buf[0].locator.ordinal, page: buf[0].locator.page },
      tokenCount: estimateTokens(text),
    });
    buf = [];
    bufTokens = 0;
  };

  for (const el of ir.elements) {
    const section = el.sectionPath.join(" > ");
    const elTokens = estimateTokens(el.text);

    // A single element larger than max: split it at sentence breaks and emit
    // each piece as its own chunk (still carrying the section context).
    if (elTokens > params.maxTokens) {
      flush();
      for (const piece of splitOversized(el, params.maxTokens)) {
        const text = contextPrefix(el.sectionPath) + piece;
        chunks.push({
          ordinal: ordinal++,
          text,
          locator: { ordinal: el.locator.ordinal, page: el.locator.page },
          tokenCount: estimateTokens(text),
        });
      }
      bufSection = section;
      continue;
    }

    // Section boundary or size boundary flushes the current buffer.
    if (bufSection !== null && section !== bufSection) flush();
    if (bufTokens + elTokens > params.targetTokens) flush();

    buf.push(el);
    bufTokens += elTokens;
    bufSection = section;
  }
  flush();
  return chunks;
}

/**
 * Split an over-long element at sentence breaks, packing up to maxTokens. A
 * single sentence that is itself over max (or text with no sentence breaks at
 * all - a wall of words) is then hard-split by word count, so the "never exceed
 * max" guarantee holds even for pathological input, not just well-punctuated
 * prose.
 */
function splitOversized(el: Element, maxTokens: number): string[] {
  const sentences = el.text.split(/(?<=[.!?。！？])\s+/);
  const out: string[] = [];
  let cur: string[] = [];
  let curTokens = 0;
  const flush = () => {
    if (cur.length) out.push(cur.join(" "));
    cur = [];
    curTokens = 0;
  };
  for (const s of sentences) {
    const st = estimateTokens(s);
    if (st > maxTokens) {
      // a single sentence over the cap: flush what we have, then hard-split it.
      flush();
      for (const piece of hardSplitByWords(s, maxTokens)) out.push(piece);
      continue;
    }
    if (curTokens + st > maxTokens && cur.length) flush();
    cur.push(s);
    curTokens += st;
  }
  flush();
  return out;
}

/** Last-resort split of unbreakable text into <= maxTokens word runs. */
function hardSplitByWords(text: string, maxTokens: number): string[] {
  const words = text.trim().split(/\s+/);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += maxTokens) {
    out.push(words.slice(i, i + maxTokens).join(" "));
  }
  return out;
}
