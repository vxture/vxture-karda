// One document through extraction: canonical text -> windows -> Atlas -> the
// admission rules -> one transaction.
//
// This is the piece that joins the three parts already built (`prepare()` from
// `#146`, `storeExtraction()` from `#147`, the Atlas client) into something that
// can actually run. What it deliberately does NOT decide is WHEN it runs - the
// pipeline placement is `140-assertion-model` section 11 item 2, still the
// owner's call. Nothing here depends on that answer.

import { canonicalText, decodeSourceBytes, parseFastPath, parsePathFor } from "../processing/ir";
import { UnavailableError, QuotaError } from "../processing/orchestrator";
import type { ExtractionClient, TextWindow } from "../atlas/extract";
import { prepare, type PreparedBatch } from "./extract";
import { storeExtraction, type ExtractionContext, type StoredExtraction } from "./store";

/**
 * Characters of document text per Atlas call.
 *
 * Not a context-window limit - it is well under any model's - but a blast radius.
 * One call covering one document means a single malformed answer costs the whole
 * document; it also means offsets must stay accurate across tens of thousands of
 * characters, which is exactly where models drift.
 */
export const WINDOW_BUDGET = 6000;

export type RunStatus =
  | "ok"
  /** Atlas cannot serve this yet (no grant, quota, capability gap). Nothing was
   *  written; the work is parked, not lost. */
  | "parked"
  /** The document has no text to extract from: not a fast-path mime, or no bytes. */
  | "not_extractable";

export interface ExtractionRunResult {
  status: RunStatus;
  /** Why, when the status is not ok. A code, not a sentence - the call site
   *  turns it into language (250-i18n-seam). */
  reason: string | null;
  windows: number;
  raw: number;
  batch: PreparedBatch | null;
  stored: StoredExtraction | null;
}

/**
 * Split canonical text into windows at ELEMENT boundaries.
 *
 * Not every `WINDOW_BUDGET` characters. A fixed cut lands mid-sentence and the
 * assertion straddling it is either lost or, worse, extracted from half of
 * itself - "the contract was NOT renewed" cut after "the contract was" is a true
 * statement of something the document never said. Elements are the parser's own
 * paragraph/heading/list boundaries, so a window never ends inside a sentence.
 *
 * An element larger than the budget gets its own oversized window rather than
 * being split: cutting it would reintroduce exactly the failure the boundaries
 * exist to prevent, and one over-long paragraph is a smaller problem than a
 * confidently wrong assertion.
 */
export function windowDocument(canonical: string, budget = WINDOW_BUDGET): TextWindow[] {
  const elements = parseFastPath(canonical).elements;
  if (elements.length === 0) return canonical.trim() === "" ? [] : [{ text: canonical, baseOffset: 0 }];

  const windows: TextWindow[] = [];
  let start = elements[0].range.start;
  let end = start;

  for (const el of elements) {
    const wouldBe = el.range.end - start;
    if (end > start && wouldBe > budget) {
      windows.push({ text: canonical.slice(start, end), baseOffset: start });
      start = el.range.start;
    }
    end = el.range.end;
  }
  if (end > start) windows.push({ text: canonical.slice(start, end), baseOffset: start });
  return windows;
}

export interface ExtractionRunInput {
  documentId: string;
  documentVersion: number;
  kbId: string;
  mime: string | null;
  bytes: Buffer | null;
  tenantId: string;
  workspaceId: string;
  taskId: string;
  extractedBy: string;
  extractionRun?: string | null;
}

/**
 * Extract one document.
 *
 * ALL WINDOWS OR NOTHING. Every window is extracted before anything is written,
 * and a park in the last window discards the answers from the first. The
 * alternative - store what succeeded - sounds thriftier and is wrong: a resumed
 * run has no record of which windows already landed, so it re-extracts them and
 * the document ends up with every early assertion twice. `storeExtraction` is
 * already one transaction per document; this keeps the read side matching it.
 */
export type StoreFn = (ctx: ExtractionContext, accepted: PreparedBatch["accepted"]) => Promise<StoredExtraction>;

export async function runExtraction(
  client: ExtractionClient,
  input: ExtractionRunInput,
  // Injectable so the windowing and admission rules are testable without a
  // Postgres - the same split the read-side files use.
  store: StoreFn = storeExtraction,
): Promise<ExtractionRunResult> {
  const empty = (status: RunStatus, reason: string, windows = 0): ExtractionRunResult => ({
    status,
    reason,
    windows,
    raw: 0,
    batch: null,
    stored: null,
  });

  // Character offsets do not index bytes that are not text - the same rule
  // get_context enforces, one layer up.
  if (parsePathFor(input.mime ?? "application/octet-stream") !== "fast") {
    return empty("not_extractable", "deep_path_mime");
  }
  if (!input.bytes) return empty("not_extractable", "no_source_bytes");

  const canonical = canonicalText(decodeSourceBytes(input.bytes));
  const windows = windowDocument(canonical);
  if (windows.length === 0) return empty("not_extractable", "empty_document");

  const raw = [];
  for (const window of windows) {
    try {
      raw.push(
        ...(await client.extract({
          window,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          taskId: input.taskId,
        })),
      );
    } catch (e) {
      // A capability gap parks the whole run. Everything already extracted is
      // discarded on purpose - see the all-or-nothing rule above.
      if (e instanceof UnavailableError) return empty("parked", "capability_unavailable", windows.length);
      if (e instanceof QuotaError) return empty("parked", "quota_exhausted", windows.length);
      throw e; // transient / karda-side bug: the taxonomy's bounded retry path
    }
  }

  // Offsets arrive already rebased into document coordinates, so the bounds check
  // is against the WHOLE canonical text, not a window.
  const batch = prepare(raw, {
    documentId: input.documentId,
    documentVersion: input.documentVersion,
    textLength: canonical.length,
  }, canonical);

  const ctx: ExtractionContext = {
    kbId: input.kbId,
    extractedBy: input.extractedBy,
    extractionRun: input.extractionRun ?? null,
  };
  const stored = await store(ctx, batch.accepted);

  return { status: "ok", reason: null, windows: windows.length, raw: raw.length, batch, stored };
}
