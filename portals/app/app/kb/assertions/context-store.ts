// The database and object-store side of `karda.get_context`.
//
// Split from `context-read.ts` on the same line as the other two: the window
// rules are pure and testable without a Postgres, the lookups and the refusals
// that depend on stored state live here.

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { getObjectStore } from "../storage/objectstore";
import { canonicalText, decodeSourceBytes, parsePathFor } from "../processing/ir";
import { buildContext, contextNotFound, contextRefusal, type ContextResult } from "./context-read";

/**
 * Resolve a citation to the passage it came from, for a caller who may see
 * `visibleKbIds`.
 *
 * Same visibility rule as `get_evidence`: the library filter is part of the
 * QUERY, not a check afterwards, so an invisible citation is simply not found -
 * one branch instead of two branches that have to stay in step.
 */
export async function readContext(
  citationId: string,
  visibleKbIds: string[],
  radius: number,
): Promise<ContextResult> {
  if (!prismaEnabled() || visibleKbIds.length === 0) return contextNotFound(citationId);

  const p = await getPrismaClient();
  const chunk = await p.chunk.findFirst({
    where: { id: citationId, document: { kbId: { in: visibleKbIds } } },
    select: {
      startOffset: true,
      endOffset: true,
      version: true,
      documentId: true,
      document: { select: { storageRef: true, mime: true, activeChunkVersion: true } },
    },
  });
  if (!chunk) return contextNotFound(citationId);

  const doc = chunk.document;
  const at = (s: Parameters<typeof contextRefusal>[1]) => contextRefusal(citationId, s, chunk.documentId, chunk.version);

  // Order matters below: report the FIRST reason that applies, most specific
  // first, so a caller told `stale_version` is not left guessing whether the
  // bytes were also gone.

  // A superseded chunk version. Refused rather than sliced: the stored bytes are
  // the CURRENT ones, and reading old offsets into them would show a passage the
  // citation never pointed at - the exact failure the version filter in
  // `get_evidence` exists to prevent, one layer down.
  if (doc.activeChunkVersion !== null && chunk.version !== doc.activeChunkVersion) return at("stale_version");

  if (chunk.startOffset === null || chunk.endOffset === null) return at("no_source_range");

  // Character offsets do not index bytes that are not text. Deep-path documents
  // (PDF and friends) have chunks whose ranges are measured against the parsed
  // text, which is not what the object store holds - decoding those bytes as
  // UTF-8 would produce mojibake and slice it confidently.
  if (parsePathFor(doc.mime ?? "application/octet-stream") !== "fast") return at("not_text");

  if (!doc.storageRef) return at("source_unavailable");
  const bytes = await getObjectStore().get(doc.storageRef);
  if (!bytes) return at("source_unavailable");

  const canonical = canonicalText(decodeSourceBytes(bytes));
  return buildContext(citationId, chunk.documentId, chunk.version, canonical, {
    start: chunk.startOffset,
    end: chunk.endOffset,
  }, radius);
}
