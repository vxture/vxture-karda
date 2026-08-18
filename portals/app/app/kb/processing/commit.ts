// The atomic-replace CommitTarget (110-processing 6). Writes a document's new
// chunk set as a new version, flips document.active_chunk_version to it in one
// statement, then removes the old versions - so retrieval, which reads only the
// active version, never sees a half-updated index.
//
// The port is CommitTarget (orchestrator.ts); this is its real implementation
// over karda_kb.chunk. In-memory sibling for tests.
import type { CommitTarget, CommittedChunk } from "./orchestrator";
import { getPrismaClient } from "../../lib/db";

export interface DocumentCommitTarget extends CommitTarget {
  /** The active version after the last commit, for verification/tests. */
  activeVersion(): number | null;
}

// --- Prisma implementation --------------------------------------------------

export class PrismaCommitTarget implements DocumentCommitTarget {
  private lastActive: number | null = null;

  constructor(private documentId: string) {}

  async commit(chunks: CommittedChunk[], embeddingModel: string | null = null): Promise<void> {
    const p = await getPrismaClient();
    const withVectors = embeddingModel !== null && chunks.some((c) => c.vector !== null);

    // Next version = current active + 1 (or 1 if never committed). Reading then
    // writing inside a transaction keeps the increment consistent under the
    // per-KB serial window the queue already enforces.
    await p.$transaction(async (tx) => {
      const doc = await tx.document.findUnique({
        where: { id: this.documentId },
        select: { activeChunkVersion: true },
      });
      const nextVersion = (doc?.activeChunkVersion ?? 0) + 1;

      // 1. write the new version's chunks (coexists with the old - the unique
      //    key includes version, so ordinals do not collide). vector_ref is the
      //    pointer into the index store (ADR-002: karda_kb.chunk_embedding);
      //    set at INSERT time because chunk columns are not UPDATE-writable.
      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((c) => ({
            documentId: this.documentId,
            version: nextVersion,
            ordinal: c.ordinal,
            text: c.text,
            tokenCount: c.tokenCount,
            vectorRef: withVectors && c.vector ? `db:${embeddingModel}`.slice(0, 128) : null,
          })),
        });
      }

      // 1b. persist the vectors in the same transaction, keyed by the chunk ids
      //     createMany just assigned (queried back by the version's unique key).
      if (withVectors) {
        const created: { id: string; ordinal: number }[] = await tx.chunk.findMany({
          where: { documentId: this.documentId, version: nextVersion },
          select: { id: true, ordinal: true },
        });
        const byOrdinal = new Map(chunks.map((c) => [c.ordinal, c]));
        const rows = created.flatMap((row) => {
          const c = byOrdinal.get(row.ordinal);
          return c?.vector
            ? [{ chunkId: row.id, modelCode: embeddingModel as string, dim: c.vector.length, vector: c.vector }]
            : [];
        });
        if (rows.length > 0) await tx.chunkEmbedding.createMany({ data: rows });
      }

      // 2. atomic swap: flip the active pointer. From this statement on,
      //    retrieval reads the new version.
      await tx.document.update({
        where: { id: this.documentId },
        data: { activeChunkVersion: nextVersion, updatedAt: new Date() },
      });

      // 3. drop superseded versions. Safe now that nothing points at them; a
      //    reader that started before the swap already has its snapshot. The
      //    delete cascades to chunk_embedding (FK ON DELETE CASCADE).
      await tx.chunk.deleteMany({
        where: { documentId: this.documentId, version: { lt: nextVersion } },
      });

      this.lastActive = nextVersion;
    });
  }

  activeVersion(): number | null {
    return this.lastActive;
  }
}

// --- in-memory implementation (offline/tests) -------------------------------

interface MemChunk extends CommittedChunk {
  version: number;
}

export class InMemoryCommitTarget implements DocumentCommitTarget {
  private chunksByVersion = new Map<number, MemChunk[]>();
  private active: number | null = null;

  async commit(chunks: CommittedChunk[]): Promise<void> {
    const next = (this.active ?? 0) + 1;
    // write new version (old still present)
    this.chunksByVersion.set(next, chunks.map((c) => ({ ...c, version: next })));
    // atomic swap
    this.active = next;
    // drop superseded
    for (const v of [...this.chunksByVersion.keys()]) {
      if (v < next) this.chunksByVersion.delete(v);
    }
  }

  activeVersion(): number | null {
    return this.active;
  }

  /** Chunks retrieval would read - only the active version. */
  activeChunks(): MemChunk[] {
    return this.active === null ? [] : (this.chunksByVersion.get(this.active) ?? []);
  }

  /** Total physical versions retained (should be 1 after a commit). */
  versionCount(): number {
    return this.chunksByVersion.size;
  }
}
