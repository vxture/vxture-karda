// The database side of `karda.get_evidence`.
//
// Split from `evidence-read.ts` so the shaping rules - which statuses are
// distinct, what order assertions come back in, what a denied lookup looks like
// - are testable without a Postgres. This file is the query and the
// authorization, and it has exactly one rule of its own worth reading.

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { shapeEvidence, evidenceNotFound, type EvidenceResult, type GroundedAssertionRow } from "./evidence-read";

/**
 * Resolve a citation to what it rests on, for a caller who may see `visibleKbIds`.
 *
 * THE RULE: a citation in a library the caller cannot see answers EXACTLY like
 * a citation that does not exist. Not 403, not 404, not a different status
 * inside the body - identical. Otherwise one call per guess turns this into an
 * oracle for enumerating chunk ids across libraries the caller has no access
 * to, and provenance tooling becomes a probing surface.
 */
export async function readEvidence(citationId: string, visibleKbIds: string[]): Promise<EvidenceResult> {
  if (!prismaEnabled() || visibleKbIds.length === 0) return evidenceNotFound(citationId);

  const p = await getPrismaClient();

  // The chunk, and the library it belongs to, in one hop. `kbId` is filtered
  // here rather than checked afterwards so an invisible chunk is simply not
  // found - the not-visible and not-found paths converge on one branch instead
  // of relying on two branches staying in step.
  const chunk = await p.chunk.findFirst({
    where: { id: citationId, document: { kbId: { in: visibleKbIds } } },
    select: {
      id: true,
      startOffset: true,
      endOffset: true,
      version: true,
      documentId: true,
      document: { select: { verificationState: true } },
    },
  });
  if (!chunk) return evidenceNotFound(citationId);

  // Every assertion grounded in THIS document version. The version filter is
  // load-bearing: a span from version 3 describes text version 4 may no longer
  // contain, and matching across versions would attribute an assertion to a
  // passage that never said it.
  const evidence = await p.evidence.findMany({
    where: {
      stance: "supports",
      span: { documentId: chunk.documentId, documentVersion: chunk.version },
      assertion: { contentState: { notIn: ["deleted"] } },
    },
    select: {
      span: {
        select: { id: true, documentId: true, documentVersion: true, startOffset: true, endOffset: true, excerpt: true },
      },
      assertion: {
        select: {
          id: true,
          kind: true,
          subject: true,
          statement: true,
          assertedBy: true,
          asOf: true,
          validUntil: true,
          verificationState: true,
          supersededById: true,
        },
      },
    },
  });

  const candidates: GroundedAssertionRow[] = evidence
    .filter((e) => e.span !== null)
    .map((e) => ({
      assertionId: e.assertion.id,
      kind: e.assertion.kind,
      subject: e.assertion.subject,
      statement: e.assertion.statement,
      assertedBy: e.assertion.assertedBy,
      asOf: e.assertion.asOf?.toISOString() ?? null,
      validUntil: e.assertion.validUntil?.toISOString() ?? null,
      verificationState: e.assertion.verificationState,
      supersededById: e.assertion.supersededById,
      span: {
        spanId: e.span!.id,
        documentId: e.span!.documentId,
        documentVersion: e.span!.documentVersion,
        startOffset: e.span!.startOffset,
        endOffset: e.span!.endOffset,
        excerpt: e.span!.excerpt,
      },
      // KD-209's consultable signal, read fresh through the chain every time
      // rather than copied onto the assertion - a copy would go stale the
      // moment the document is re-verified or lapses.
      sourceDocumentVerification: chunk.document.verificationState,
    }));

  return shapeEvidence(
    {
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentVersion: chunk.version,
      startOffset: chunk.startOffset,
      endOffset: chunk.endOffset,
    },
    candidates,
  );
}
