// The recallable corpus behind BM25 (TD-008): the text units a lexical query
// ranks over. A unit is a chunk (for a document) or an entry, and ONLY `indexed`
// content is a unit - the hard recall filter (100-kb-model 6). Until Atlas A1
// commits chunks, the chunk side is empty by construction; the entry side and the
// whole path are live, so this is ready, not stubbed.
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import type { VerificationState } from "../lib/state";

export type RecallUnitKind = "chunk" | "entry";

export interface RecallUnit {
  /** The recall-unit id = the RecallHit id (a chunk id or an entry id). */
  id: string;
  kbId: string;
  kind: RecallUnitKind;
  text: string;
  /** For the quality-tier (verification) filter, applied by the recaller. */
  verificationState: VerificationState;
}

export interface RecallCorpus {
  /** Recallable units (indexed content only) for the given libraries. */
  units(kbIds: string[]): Promise<RecallUnit[]>;
}

/** Resolves recall-unit ids back to their text - for ask grounding + citation. */
export interface RecallTextResolver {
  resolve(ids: string[]): Promise<{ id: string; kbId: string; text: string }[]>;
}

// --- in-memory (offline / tests) --------------------------------------------

export class InMemoryRecallCorpus implements RecallCorpus, RecallTextResolver {
  constructor(private all: RecallUnit[] = []) {}
  add(u: RecallUnit): void {
    this.all.push(u);
  }
  async units(kbIds: string[]): Promise<RecallUnit[]> {
    const set = new Set(kbIds);
    return this.all.filter((u) => set.has(u.kbId));
  }
  async resolve(ids: string[]): Promise<{ id: string; kbId: string; text: string }[]> {
    const set = new Set(ids);
    return this.all.filter((u) => set.has(u.id)).map((u) => ({ id: u.id, kbId: u.kbId, text: u.text }));
  }
}

// --- Prisma over karda_kb ----------------------------------------------------

/** Entry text = its string field values joined. A later refinement can weight by
 *  the template's retrieval_role (search_text vs store_only); indexing all string
 *  fields is the safe v1. */
function entryText(fields: unknown): string {
  if (!fields || typeof fields !== "object") return "";
  return Object.values(fields as Record<string, unknown>)
    .filter((v): v is string => typeof v === "string")
    .join(" ");
}

export class PrismaRecallCorpus implements RecallCorpus {
  async units(kbIds: string[]): Promise<RecallUnit[]> {
    if (kbIds.length === 0) return [];
    const p = await getPrismaClient();
    const out: RecallUnit[] = [];

    // Chunks of the ACTIVE version of indexed documents.
    const docs: { id: string; kbId: string; verificationState: string; activeChunkVersion: number | null }[] =
      await p.document.findMany({
        where: { kbId: { in: kbIds }, contentState: "indexed" },
        select: { id: true, kbId: true, verificationState: true, activeChunkVersion: true },
      });
    const docById = new Map(docs.map((d) => [d.id, d]));
    if (docs.length > 0) {
      const chunks: { id: string; documentId: string; text: string; version: number }[] = await p.chunk.findMany({
        where: { documentId: { in: docs.map((d) => d.id) } },
        select: { id: true, documentId: true, text: true, version: true },
      });
      for (const c of chunks) {
        const d = docById.get(c.documentId);
        if (d && c.version === d.activeChunkVersion) {
          out.push({ id: c.id, kbId: d.kbId, kind: "chunk", text: c.text, verificationState: d.verificationState as VerificationState });
        }
      }
    }

    // Indexed entries.
    const entries: { id: string; kbId: string; verificationState: string; fields: unknown }[] = await p.entry.findMany({
      where: { kbId: { in: kbIds }, contentState: "indexed" },
      select: { id: true, kbId: true, verificationState: true, fields: true },
    });
    for (const e of entries) {
      out.push({ id: e.id, kbId: e.kbId, kind: "entry", text: entryText(e.fields), verificationState: e.verificationState as VerificationState });
    }
    return out;
  }
}

export function getRecallCorpus(): RecallCorpus {
  return prismaEnabled() ? new PrismaRecallCorpus() : new InMemoryRecallCorpus();
}

/** Resolve recall-unit ids (chunks + entries) to their text, by id. */
export class PrismaRecallTextResolver implements RecallTextResolver {
  async resolve(ids: string[]): Promise<{ id: string; kbId: string; text: string }[]> {
    if (ids.length === 0) return [];
    const p = await getPrismaClient();
    const out: { id: string; kbId: string; text: string }[] = [];
    const chunks: { id: string; text: string; document: { kbId: string } | null }[] = await p.chunk.findMany({
      where: { id: { in: ids } },
      select: { id: true, text: true, document: { select: { kbId: true } } },
    });
    for (const c of chunks) if (c.document) out.push({ id: c.id, kbId: c.document.kbId, text: c.text });
    const entries: { id: string; kbId: string; fields: unknown }[] = await p.entry.findMany({
      where: { id: { in: ids } },
      select: { id: true, kbId: true, fields: true },
    });
    for (const e of entries) out.push({ id: e.id, kbId: e.kbId, text: entryText(e.fields) });
    return out;
  }
}

export function getRecallTextResolver(): RecallTextResolver {
  return prismaEnabled() ? new PrismaRecallTextResolver() : new InMemoryRecallCorpus();
}
