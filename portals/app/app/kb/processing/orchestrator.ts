// The processing orchestrator (110-processing 2): drives a document through
// fetch -> parse -> chunk -> embed -> commit, persisting each stage's product so
// a transient failure resumes from where it stopped, and mapping the outcome
// onto the document's content state.
//
// This is the seam where Atlas enters. The embed stage calls an EmbeddingClient;
// the only implementation available now is a stub that throws a quota-style
// "unavailable" (A1 is unbuilt, TD-004). Because the failure taxonomy already
// treats an embedding failure as suspend-not-fail, a document with no embedder
// parks in a resumable state rather than dying - which is exactly the behaviour
// we want when the capability lands: the parked tasks resume, nothing is lost.
import type { DocumentIR } from "./ir";
import { parseFastPath, parsePathFor } from "./ir";
import { chunkGeneral, type Chunk, type ChunkParams, DEFAULT_CHUNK_PARAMS } from "./chunk";
import { classifyOutcome, type Stage, type FailureClass } from "./stages";

// --- ports the orchestrator drives ------------------------------------------

export interface RawSource {
  /** Fetch the raw bytes/text for a document. Fast path needs the text. */
  fetchText(): Promise<string>;
  mime: string;
}

export interface EmbeddingClient {
  /** Embed chunk texts. Throws on unavailability - see classifyEmbeddingError. */
  embed(texts: string[], modelVersion: string): Promise<number[][]>;
}

export interface CommitTarget {
  /** Atomic replace (110-processing 6): write the new chunk set as a new version. */
  commit(chunks: CommittedChunk[]): Promise<void>;
}

export interface CommittedChunk extends Chunk {
  vector: number[] | null; // null when embedding is deferred
}

// --- results ----------------------------------------------------------------

export type StageResult =
  | { done: true; committed: number }
  | { failed: true; stage: Stage; class: FailureClass; reason: string; outcome: ReturnType<typeof classifyOutcome> };

export interface RunInput {
  source: RawSource;
  embedder: EmbeddingClient;
  target: CommitTarget;
  chunkParams?: ChunkParams;
  embeddingModel: string | null;
  /** transient attempts already made (for the failure decision). */
  attempt?: number;
}

/**
 * Run the pipeline for one document. Returns a StageResult describing where it
 * ended - the caller (a task runner, not built in 5a) persists the document
 * state and schedules a retry/suspend accordingly.
 */
export async function runPipeline(input: RunInput): Promise<StageResult> {
  const attempt = input.attempt ?? 0;
  const params = input.chunkParams ?? DEFAULT_CHUNK_PARAMS;

  // fetch
  let text: string;
  try {
    text = await input.source.fetchText();
  } catch (e) {
    return failure("fetch", classifyFetchError(e), errMessage(e), attempt);
  }

  // parse - fast path only in 5a; deep path is a permanent failure until A2.
  let ir: DocumentIR;
  try {
    if (parsePathFor(input.source.mime) === "deep") {
      // A2 (vision parse models) unbuilt: a scanned/complex-layout doc cannot be
      // parsed yet. Permanent-for-now so it rests in `failed` visibly rather than
      // retrying against a capability that does not exist.
      return failure("parse", "permanent", "deep-path parsing requires Atlas vision models (unavailable)", attempt);
    }
    ir = parseFastPath(text);
  } catch (e) {
    return failure("parse", "permanent", errMessage(e), attempt);
  }

  // chunk
  let chunks: Chunk[];
  try {
    chunks = chunkGeneral(ir, params);
  } catch (e) {
    return failure("chunk", "permanent", errMessage(e), attempt);
  }

  // embed - the Atlas seam
  let vectors: number[][] | null = null;
  try {
    vectors = await input.embedder.embed(
      chunks.map((c) => c.text),
      input.embeddingModel ?? "unset",
    );
  } catch (e) {
    return failure("embed", classifyEmbeddingError(e), errMessage(e), attempt);
  }

  // commit - atomic replace
  try {
    const committed: CommittedChunk[] = chunks.map((c, i) => ({ ...c, vector: vectors ? vectors[i] : null }));
    await input.target.commit(committed);
    return { done: true, committed: committed.length };
  } catch (e) {
    return failure("commit", classifyFetchError(e), errMessage(e), attempt);
  }
}

function failure(stage: Stage, cls: FailureClass, reason: string, attempt: number): StageResult {
  return { failed: true, stage, class: cls, reason, outcome: classifyOutcome(cls, stage, attempt) };
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- error classification ---------------------------------------------------

export class QuotaError extends Error {}
export class UnavailableError extends Error {} // treated as quota-style: suspend, resume later

/** fetch/commit errors are transient by default (network, transient DB). */
function classifyFetchError(e: unknown): FailureClass {
  if (e instanceof QuotaError) return "quota";
  return "transient";
}

/**
 * An embedding failure is transient (Atlas 429/timeout) EXCEPT quota exhaustion
 * and capability-unavailable, which suspend rather than fail - a suspended task
 * resumes automatically when quota returns or when A1 ships. This is what lets
 * the whole embed stage be parked-but-not-lost while Atlas builds A1 (TD-004).
 */
function classifyEmbeddingError(e: unknown): FailureClass {
  if (e instanceof QuotaError || e instanceof UnavailableError) return "quota";
  return "transient";
}

// --- the stub embedder (A1 unbuilt) -----------------------------------------

/**
 * Embedding client used until Atlas ships A1. It suspends rather than fails, so
 * documents flow through fetch/parse/chunk and then park at embed in a resumable
 * state. When the real client lands, those parked tasks resume and index; no
 * data and no work before the embed stage is lost.
 */
export class UnavailableEmbeddingClient implements EmbeddingClient {
  async embed(): Promise<number[][]> {
    throw new UnavailableError("embedding capability (Atlas A1) is not yet available");
  }
}
