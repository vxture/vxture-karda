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

  async commit(chunks: CommittedChunk[]): Promise<void> {
    const p = await getPrismaClient();

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
      //    key includes version, so ordinals do not collide)
      if (chunks.length > 0) {
        await tx.chunk.createMany({
          data: chunks.map((c) => ({
            documentId: this.documentId,
            version: nextVersion,
            ordinal: c.ordinal,
            text: c.text,
            tokenCount: c.tokenCount,
            vectorRef: null, // set by the embed stage when A1 lands
          })),
        });
      }

      // 2. atomic swap: flip the active pointer. From this statement on,
      //    retrieval reads the new version.
      await tx.document.update({
        where: { id: this.documentId },
        data: { activeChunkVersion: nextVersion, updatedAt: new Date() },
      });

      // 3. drop superseded versions. Safe now that nothing points at them; a
      //    reader that started before the swap already has its snapshot.
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
