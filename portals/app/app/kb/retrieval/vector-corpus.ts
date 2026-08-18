// The vector corpus behind vector recall (5b/6b; ADR-002): the stored chunk
// embeddings a semantic query ranks over. Mirrors corpus.ts's discipline: only
// chunks of the ACTIVE version of `indexed` documents are units (the hard
// recall filter), and the embedding's model_code rides along so recall can
// enforce the KD-107 model lock - a query vector is only comparable to chunk
// vectors from the SAME model; mixing spaces produces confident nonsense, not
// an error.
//
// Storage is karda_kb.chunk_embedding (ADR-002): vectors in Postgres as JSONB,
// similarity computed in-process. Right for the current scale; the ADR names
// pgvector as the scale path, behind this same port.
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import type { VerificationState } from "../lib/state";

export interface VectorUnit {
  id: string; // chunk id = the RecallHit id
  kbId: string;
  modelCode: string;
  vector: number[];
  verificationState: VerificationState;
}

export interface VectorCorpus {
  /** Vector units (indexed documents' active chunks only) for the given libraries. */
  vectors(kbIds: string[]): Promise<VectorUnit[]>;
}

// --- in-memory (offline / tests) --------------------------------------------

export class InMemoryVectorCorpus implements VectorCorpus {
  constructor(private all: VectorUnit[] = []) {}
  add(u: VectorUnit): void {
    this.all.push(u);
  }
  async vectors(kbIds: string[]): Promise<VectorUnit[]> {
    const set = new Set(kbIds);
    return this.all.filter((u) => set.has(u.kbId));
  }
}

// --- Prisma over karda_kb.chunk_embedding ------------------------------------

export class PrismaVectorCorpus implements VectorCorpus {
  async vectors(kbIds: string[]): Promise<VectorUnit[]> {
    if (kbIds.length === 0) return [];
    const p = await getPrismaClient();

    const docs: { id: string; kbId: string; verificationState: string; activeChunkVersion: number | null }[] =
      await p.document.findMany({
        where: { kbId: { in: kbIds }, contentState: "indexed" },
        select: { id: true, kbId: true, verificationState: true, activeChunkVersion: true },
      });
    if (docs.length === 0) return [];
    const docById = new Map(docs.map((d) => [d.id, d]));

    const rows: {
      chunkId: string;
      modelCode: string;
      vector: unknown;
      chunk: { documentId: string; version: number } | null;
    }[] = await p.chunkEmbedding.findMany({
      where: { chunk: { documentId: { in: docs.map((d) => d.id) } } },
      select: {
        chunkId: true,
        modelCode: true,
        vector: true,
        chunk: { select: { documentId: true, version: true } },
      },
    });

    const out: VectorUnit[] = [];
    for (const r of rows) {
      if (!r.chunk) continue;
      const d = docById.get(r.chunk.documentId);
      if (!d || r.chunk.version !== d.activeChunkVersion) continue;
      const vector = asVector(r.vector);
      if (!vector) continue; // a malformed row is skipped, never fatal to recall
      out.push({
        id: r.chunkId,
        kbId: d.kbId,
        modelCode: r.modelCode,
        vector,
        verificationState: d.verificationState as VerificationState,
      });
    }
    return out;
  }
}

function asVector(v: unknown): number[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === "number") ? (v as number[]) : null;
}

export function getVectorCorpus(): VectorCorpus {
  return prismaEnabled() ? new PrismaVectorCorpus() : new InMemoryVectorCorpus();
}
